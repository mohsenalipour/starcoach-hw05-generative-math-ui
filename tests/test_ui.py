"""Meaningful visual math, integration, isolation and HTTP boundary tests."""
import http.client
import json
from pathlib import Path
import threading
import time
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer

from app import Workspace, make_handler
from core_bridge import MathTutorAgent, TutorError
from demo_provider import DemoProvider
from visuals import VisualSpec, compute_visual, sample_visual, choose_visual


class VisualMathTests(unittest.TestCase):
    def test_tangent_point_and_derivative(self):
        data = compute_visual(VisualSpec(kind='tangent', expression='x**3+2*x', focus=2))
        self.assertEqual(data['slope'], 14)
        self.assertEqual(data['focus'], [2,12])

    def test_parameter_changes_curve_without_mutating_lesson(self):
        spec = VisualSpec(kind='function', expression='y*x**2+z', parameters=[
            {'name':'y','label':'a','value':1},{'name':'z','label':'b','value':0}])
        first = compute_visual(spec)
        spec.parameters[0].value=2
        second=compute_visual(spec)
        self.assertAlmostEqual(second['points'][-1][1], first['points'][-1][1]*2)

    def test_signed_integral_and_changed_bounds(self):
        self.assertAlmostEqual(compute_visual(VisualSpec(kind='integral',expression='x**2'))['integral'],8/3)
        self.assertAlmostEqual(compute_visual(VisualSpec(kind='integral',expression='-x**2'))['integral'],-8/3)
        self.assertAlmostEqual(compute_visual(VisualSpec(kind='integral',expression='x**2',upper=1))['integral'],1/3)

    def test_natural_parameter_names_do_not_change_core_parser(self):
        from math_tools import SYMBOLS
        before=set(SYMBOLS)
        spec=VisualSpec(kind='function',expression='a*x**2+b',parameters=[
            {'name':'a','label':'a','value':2},{'name':'b','label':'b','value':1}])
        data=compute_visual(spec)
        self.assertEqual(data['points'][-1][1],33)
        self.assertEqual(set(SYMBOLS),before)

    def test_triangle_circle_and_matrix(self):
        tri=compute_visual(VisualSpec(kind='geometry'))
        self.assertEqual(tri['c'],5)
        circle=compute_visual(VisualSpec(kind='geometry',shape='circle'))
        self.assertAlmostEqual(circle['area'],3.141592653589793*9)
        matrix=compute_visual(VisualSpec(kind='matrix',matrix=[[1,2],[3,4]]))
        self.assertEqual(matrix['metrics'][0]['value'],-2)

    def test_poles_are_broken_and_divergent_integral_rejected(self):
        data=compute_visual(VisualSpec(kind='function',expression='1/x'))
        self.assertTrue(any(y is None for x,y in data['points']))
        with self.assertRaises(ValueError):
            compute_visual(VisualSpec(kind='integral',expression='1/x',lower=-1,upper=1))

    def test_invalid_ranges_and_arbitrary_code_rejected(self):
        for payload in [{'kind':'integral','expression':'x','lower':2,'upper':1},
                        {'kind':'function','expression':'x','x_min':4,'x_max':1},
                        {'kind':'matrix','matrix':[[1,2],[3]]},
                        {'kind':'geometry','parameters':[{'name':'y','label':'r','minimum':-1,'maximum':5,'value':2}]},
                        {'kind':'function','expression':'x','html':'<script>bad</script>'}]:
            with self.assertRaises(ValueError): VisualSpec.model_validate(payload)
        with self.assertRaises(ValueError): compute_visual(VisualSpec(kind='function',expression="__import__('os').system('echo bad')"))
        with self.assertRaises(ValueError): compute_visual(VisualSpec(kind='function',expression='x**10000'))

    def test_unsupported_symbols_require_parameters(self):
        with self.assertRaises(ValueError): compute_visual(VisualSpec(kind='function',expression='y*x'))

    def test_worker_timeout_falls_back_explicitly(self):
        import subprocess
        with patch('visuals.subprocess.run',side_effect=subprocess.TimeoutExpired('worker',7)):
            with self.assertRaises(ValueError): sample_visual(VisualSpec())

    def test_worker_handles_persian_parameter_labels(self):
        spec=VisualSpec(kind='geometry',parameters=[
            {'name':'y','label':'ضلع افقی','minimum':0.5,'maximum':10,'value':3},
            {'name':'z','label':'ضلع عمودی','minimum':0.5,'maximum':10,'value':4}])
        self.assertEqual(sample_visual(spec)['c'],5)

    def test_unverified_never_generates_visual(self):
        class NoCalls:
            def structured(self,*a): raise AssertionError('Model must not be called.')
        spec,source=choose_visual(NoCalls(),{'status':'unverified'})
        self.assertEqual((spec.kind,source),('steps','none'))

    def test_visual_error_keeps_valid_tutor_answer(self):
        class FailedVisual(DemoProvider):
            def structured(self,stage,*args):
                if stage=='design_visual':raise TutorError('Invalid schema')
                return super().structured(stage,*args)
        agent=MathTutorAgent(FailedVisual())
        state=agent.run('مشتق x^3 + 2*x را حساب کن',language='fa')
        spec,source=choose_visual(agent.provider,state)
        self.assertEqual(state['status'],'answered')
        self.assertEqual(spec.expression,'x**3 + 2*x')
        self.assertEqual(source,'fallback')


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.workspace=Workspace(demo=True)
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),make_handler(cls.workspace))
        cls.port=cls.server.server_port
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close();cls.workspace.close();cls.thread.join()

    def request(self,path,payload=None,origin=None):
        client=http.client.HTTPConnection('127.0.0.1',self.port,timeout=15)
        headers={'Content-Type':'application/json'}
        if origin:headers['Origin']=origin
        client.request('POST' if payload is not None else 'GET',path,body=json.dumps(payload) if payload is not None else None,headers=headers)
        response=client.getresponse();status=response.status;raw=response.read();client.close()
        try:data=json.loads(raw)
        except ValueError:data=raw
        return status,data

    def wait_job(self,job,sid):
        for _ in range(80):
            status,data=self.request(f'/api/jobs/{job}?session_id={sid}')
            if data['status']!='running':return data
            time.sleep(.1)
        self.fail('Job did not finish.')

    def test_chat_uses_graph_and_preserves_clarification(self):
        _,session=self.request('/api/sessions',{});sid=session['session_id']
        _,job=self.request('/api/messages',{'session_id':sid,'question':'این معادله را حل کن'})
        first=self.wait_job(job['job_id'],sid)
        self.assertEqual(first['result']['state']['status'],'needs_clarification')
        _,job=self.request('/api/messages',{'session_id':sid,'question':'2*x + 3 = 7'})
        second=self.wait_job(job['job_id'],sid)
        self.assertEqual(second['result']['state']['draft']['result'],'2')
        self.assertEqual(second['result']['state']['verification'],'symbolically_checked')
        self.assertIn('calculate',[e['node'] for e in second['result']['state']['trace']])
        self.assertTrue(second['result']['state']['history'])

    def test_sessions_isolate_history_and_jobs(self):
        _,one=self.request('/api/sessions',{});_,two=self.request('/api/sessions',{})
        _,job=self.request('/api/messages',{'session_id':one['session_id'],'question':'مثلث قائم را توضیح بده'})
        self.wait_job(job['job_id'],one['session_id'])
        status,_=self.request(f"/api/jobs/{job['job_id']}?session_id={two['session_id']}")
        self.assertEqual(status,404)
        self.assertEqual(self.workspace.sessions[two['session_id']].session.history,[])

    def test_private_files_and_cross_origin_are_blocked(self):
        for path in ['/.env','/static/../.env','/static/%2e%2e/.env','/tutor_core/provider.py']:
            self.assertEqual(self.request(path)[0],404)
        self.assertEqual(self.request('/api/sessions',{},origin='https://evil.example')[0],403)
        _,data=self.request('/api/health')
        self.assertNotIn('api_key',json.dumps(data))

    def test_visual_resample_is_independent_of_conversation(self):
        before=len(self.workspace.sessions)
        status,data=self.request('/api/visual',{'visual':{'kind':'tangent','expression':'x**2','focus':2}})
        self.assertEqual(status,200);self.assertEqual(data['data']['slope'],4)
        self.assertEqual(len(self.workspace.sessions),before)

    def test_duplicate_turn_is_rejected_while_busy(self):
        _,session=self.request('/api/sessions',{});sid=session['session_id']
        self.workspace.sessions[sid].busy=True
        status,_=self.request('/api/messages',{'session_id':sid,'question':'مشتق چیست؟'})
        self.assertEqual(status,400)
        self.workspace.sessions[sid].busy=False

    def test_history_http_survives_release_and_supports_rename_and_delete(self):
        _,session=self.request('/api/sessions',{});sid=session['session_id']
        with patch('app.sample_visual',return_value={'kind':'steps'}):
            _,job=self.request('/api/messages',{'session_id':sid,'question':'مشتق چیست؟'})
            self.wait_job(job['job_id'],sid)
        self.assertEqual(self.request('/api/reset',{'session_id':sid})[0],200)
        _,listing=self.request('/api/history')
        self.assertIn(sid,[entry['id'] for entry in listing['conversations']])
        self.assertEqual(self.request('/api/conversations/rename',{'session_id':sid,'title':'تمرین من'})[0],200)
        _,record=self.request('/api/conversations/'+sid)
        self.assertEqual(record['title'],'تمرین من')
        self.assertEqual(len(record['turns']),1)
        self.assertNotIn('checkpoint',record)
        self.assertEqual(self.request('/api/conversations/delete',{'session_id':sid})[0],200)
        self.assertEqual(self.request('/api/conversations/'+sid)[0],404)

    def test_image_http_decodes_before_vision_and_returns_only_preview(self):
        from test_history_images import encoded_image
        class Reader:
            model='test'
            def read(self,uri):return {'question':'2*x + 3 = 7','warning':'','readable':True}
        with patch.object(self.workspace,'vision',Reader()):
            for invalid in ['https://example.com/photo.png','not base64!']:
                self.assertEqual(self.request('/api/images',{'image':invalid})[0],400)
            self.assertEqual(self.request('/api/images',{'image':encoded_image()},origin='https://evil.example')[0],403)
            status,result=self.request('/api/images',{'image':encoded_image()})
            self.assertEqual(status,200)
            self.assertIn('attachment_id',result)
            self.assertIn('thumbnail',result)
            self.assertNotIn('image',result)


if __name__=='__main__':unittest.main()
