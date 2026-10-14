"""A visual is required, with faithful calculus context and bounded recovery."""
from copy import deepcopy
import unittest
from unittest.mock import patch

from app import Workspace
from core_bridge import TutorError
from visuals import VisualSpec, VisualPlan, choose_visual, compute_visual


def accepted(question, tool=None, topic='انتگرال', kind='concept'):
    return {'status':'answered', 'question':question, 'raw_request':question,
        'analysis':{'tool_request':tool, 'topic':topic, 'request_kind':kind, 'normalized_question':question},
        'plan':{'steps':['تابع', 'انباشت', 'نتیجه']}, 'learner_level':'beginner',
        'draft':{'introduction':'توضیح معتبر', 'steps':['یک توضیح کامل که در چت می‌ماند.'], 'result':'8/3'}}


class NoCalls:
    def structured(self, *args):
        raise AssertionError('A second model call must not be needed.')


class MandatoryVisualTests(unittest.TestCase):
    def test_calculus_plot_is_authoritative_without_an_extra_model_call(self):
        state=accepted('انتگرال x^2 از صفر تا سه', {'operation':'integrate','expression':'x**2','lower_bound':'0','upper_bound':'3'}, kind='problem')
        spec, source=choose_visual(NoCalls(),state)
        self.assertEqual((spec.kind,source),('integral','tool'))
        self.assertEqual((spec.expression,spec.lower,spec.upper),('x**2',0,3))
        self.assertEqual(compute_visual(spec)['integral'],9)

    def test_area_followup_keeps_the_same_function_and_bounds(self):
        previous={'visual':VisualSpec(kind='integral',expression='x**3',lower=1,upper=3).model_dump()}
        spec, source=choose_visual(NoCalls(),accepted('به صورت سطح زیر نمودار هم میتونی به صورت بصری نشون بدی؟'),previous)
        self.assertEqual((spec.kind,source),('integral','context'))
        self.assertEqual((spec.expression,spec.lower,spec.upper),('x**3',1,3))
        self.assertEqual(compute_visual(spec)['integral'],20)

    def test_model_cannot_choose_text_steps_for_an_accepted_lesson(self):
        class IgnoringProvider:
            def structured(self,*args):return VisualSpec()
        with self.assertRaises(ValueError):VisualPlan(kind='steps')
        state=accepted('رابطهٔ چند مفهوم را توضیح بده',topic='منطق ریاضی')
        spec, source=choose_visual(IgnoringProvider(),state)
        self.assertEqual((spec.kind,source),('diagram','fallback'))
        data=compute_visual(spec)
        self.assertGreaterEqual(len(data['nodes']),2)
        self.assertTrue(data['edges'])
        self.assertNotIn(state['draft']['steps'][0],str(data))

    def test_new_topic_does_not_inherit_an_unrelated_previous_plot(self):
        class FailedProvider:
            def structured(self,*args):raise TutorError('Unavailable')
        previous={'visual':VisualSpec(kind='integral',expression='x**2').model_dump()}
        spec,_=choose_visual(FailedProvider(),accepted('دایره را به صورت بصری توضیح بده',topic='دایره'),previous)
        self.assertEqual((spec.kind,spec.shape),('geometry','circle'))

    def test_scalar_calculation_does_not_become_an_unrelated_constant_function_plot(self):
        class DiagramProvider:
            def structured(self,stage,instructions,context,schema):
                return schema(kind='diagram',nodes=[{'label':'حالت‌های ممکن'},{'label':'احتمال', 'latex':'P=1/4'}],edges=[{'start':0,'end':1}])
        state=accepted('احتمال دو بار شیر آمدن',{'operation':'simplify','expression':'1/4'},topic='احتمال',kind='problem')
        spec,source=choose_visual(DiagramProvider(),state)
        self.assertEqual((spec.kind,source),('diagram','model'))

    def test_equation_roots_are_zeroes_of_the_actual_residual(self):
        state=accepted('2*x+3=7',{'operation':'solve','expression':'2*x+3=7'},topic='معادله',kind='problem')
        spec,_=choose_visual(NoCalls(),state)
        self.assertEqual(spec.expression,'(2*x+3)-(7)')
        data=compute_visual(spec)
        self.assertTrue(any(abs(x-2)<1e-10 and abs(y)<1e-10 for x,y in data['points']))

    def test_failed_numeric_plot_recovers_to_a_graphic_without_changing_answer(self):
        workspace=Workspace(demo=True)
        state=accepted('انتگرال را حساب کن',{'operation':'integrate','expression':'x**2'},kind='problem')
        original=deepcopy(state)
        try:
            with patch('app.sample_visual',side_effect=ValueError('worker unavailable')):
                spec,data,warning=workspace._visual_result(VisualSpec(kind='integral',expression='x**2'),state)
            self.assertEqual((spec.kind,data['kind']),('diagram','diagram'))
            self.assertTrue(warning)
            self.assertEqual(state,original)
        finally:workspace.close()

    def test_old_text_only_history_is_upgraded_and_cached_without_rewriting_answers(self):
        workspace=Workspace(demo=True)
        try:
            sid=workspace.create_session()
            first=accepted('انتگرال x^2 از صفر تا دو',{'operation':'integrate','expression':'x**2','lower_bound':'0','upper_bound':'2'},kind='problem')
            second=accepted('همین را با سطح زیر نمودار نشان بده')
            for state in (first,second):
                workspace.store.append(sid,state['question'],{'state':state,'visual':VisualSpec().model_dump(),'data':{'kind':'steps'}},{})
            with patch('app.sample_visual',side_effect=compute_visual) as sample:
                upgraded=workspace.conversation(sid)
                count=sample.call_count
                workspace.conversation(sid)
                self.assertEqual(sample.call_count,count)
            self.assertTrue(all(t['result']['visual']['kind']=='integral' for t in upgraded['turns']))
            self.assertAlmostEqual(upgraded['turns'][-1]['result']['data']['integral'],8/3)
            original=workspace.store.get(sid)
            self.assertEqual(original['turns'][1]['result']['state'],second)
            self.assertEqual(original['turns'][1]['result']['visual']['kind'],'steps')
        finally:workspace.close()

    def test_diagram_links_are_bounded_and_cannot_reference_missing_nodes(self):
        for edges in ([{'start':0,'end':0}],[{'start':0,'end':5}]):
            with self.assertRaises(ValueError):
                VisualSpec(kind='diagram',nodes=[{'label':'A'},{'label':'B'}],edges=edges)


if __name__=='__main__':unittest.main()
