"""Persistence, image validation and attachment integration at real boundaries."""
import base64
from io import BytesIO
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch
from PIL import Image
from app import Workspace
from core_bridge import TutorError
from image_input import prepare_image, MAX_IMAGE_BYTES
from demo_provider import DemoProvider


def encoded_image(fmt='PNG'):
    image=Image.new('RGB',(200,90),'white');out=BytesIO();image.save(out,format=fmt)
    return base64.b64encode(out.getvalue()).decode()


def completed(workspace,sid,question,**extra):
    jid=workspace.send({'session_id':sid,'question':question,**extra})
    for _ in range(150):
        job=workspace.job(jid,sid)
        if job['status']!='running':
            if job['status']!='completed':raise AssertionError(job)
            return job['result']
        time.sleep(.02)
    raise AssertionError('Job did not complete')


class PersistenceTests(unittest.TestCase):
    def test_storage_failure_restores_previous_session_context(self):
        workspace=Workspace(demo=True)
        try:
            sid=workspace.create_session()
            with patch.object(workspace.store,'append',side_effect=OSError('disk full')), patch('app.sample_visual',return_value={'kind':'steps'}):
                jid=workspace.send({'session_id':sid,'question':'مشتق چیست؟'})
                for _ in range(100):
                    if workspace.job(jid,sid)['status']!='running':break
                    time.sleep(.01)
            self.assertEqual(workspace.job(jid,sid)['status'],'error')
            self.assertEqual(workspace.sessions[sid].session.history,[])
            self.assertIsNone(workspace.sessions[sid].session.last_state)
            self.assertEqual(workspace.conversation(sid)['turns'],[])
        finally:workspace.close()

    def test_restart_restores_pending_clarification_and_real_context(self):
        with tempfile.TemporaryDirectory() as directory, patch('app.sample_visual',return_value={'kind':'steps'}):
            path=Path(directory)/'history.sqlite3'
            first=Workspace(demo=True,db_path=path)
            sid=first.create_session();result=completed(first,sid,'این معادله را حل کن')
            self.assertEqual(result['state']['status'],'needs_clarification')
            first.close()
            second=Workspace(demo=True,db_path=path)
            try:
                self.assertEqual(len(second.conversation(sid)['turns']),1)
                result=completed(second,sid,'2*x + 3 = 7')
                self.assertEqual(result['state']['draft']['result'],'2')
                self.assertEqual(result['state']['verification'],'symbolically_checked')
                self.assertTrue(result['state']['history'])
                self.assertEqual(len(second.conversation(sid)['turns']),2)
                self.assertNotIn('checkpoint',second.conversation(sid))
            finally:second.close()

    def test_new_conversation_preserves_old_and_rename_delete_are_isolated(self):
        workspace=Workspace(demo=True)
        try:
            with patch('app.sample_visual',return_value={'kind':'steps'}):
                one=workspace.create_session();completed(workspace,one,'مشتق چیست؟')
                two=workspace.create_session();completed(workspace,two,'مثلث قائم را توضیح بده')
            workspace.clear(one)
            self.assertEqual(len(workspace.store.list()),2)
            workspace.store.rename(one,'تمرین مشتق')
            self.assertEqual(workspace.conversation(one)['title'],'تمرین مشتق')
            workspace.sessions[two].busy=True
            with self.assertRaises(TutorError):workspace.delete(two)
            workspace.sessions[two].busy=False
            workspace.delete(one)
            self.assertEqual([h['id'] for h in workspace.store.list()],[two])
            with self.assertRaises(TutorError):workspace.restore(one)
        finally:workspace.close()

    def test_failed_model_turn_does_not_enter_history(self):
        class Failing(DemoProvider):
            def structured(self,*args):raise TutorError('test failure')
        workspace=Workspace(provider_factory=Failing)
        try:
            sid=workspace.create_session();jid=workspace.send({'session_id':sid,'question':'مشتق چیست؟'})
            for _ in range(100):
                if workspace.job(jid,sid)['status']!='running':break
                time.sleep(.01)
            self.assertEqual(workspace.job(jid,sid)['status'],'error')
            self.assertEqual(workspace.conversation(sid)['turns'],[])
            self.assertEqual(workspace.sessions[sid].session.history,[])
        finally:workspace.close()


class ImageTests(unittest.TestCase):
    def test_supported_images_are_reencoded_and_thumbnail_is_bounded(self):
        for fmt in ('PNG','JPEG','WEBP'):
            uri,thumb=prepare_image(encoded_image(fmt))
            self.assertTrue(uri.startswith('data:image/jpeg;base64,'))
            with Image.open(BytesIO(base64.b64decode(thumb.split(',')[1]))) as image:
                self.assertLessEqual(max(image.size),440)
                self.assertFalse(image.getexif())

    def test_non_images_external_urls_and_oversize_are_rejected(self):
        for content in ('https://example.com/image.png',base64.b64encode(b'<svg onload="bad()"/>').decode(),
                        'A'*((MAX_IMAGE_BYTES+2)*4//3+1),encoded_image('GIF'),None):
            with self.assertRaises(TutorError):prepare_image(content)
        with patch('image_input.MAX_PIXELS',100):
            with self.assertRaises(TutorError):prepare_image(encoded_image())

    def test_vision_extracts_only_then_original_graph_solves_and_history_keeps_thumbnail(self):
        class Reader:
            model='test-vision'
            def read(self,uri):
                self.uri=uri
                return {'question':'2*x + 3 = 7','warning':'','readable':True}
            def close(self):pass
        reader=Reader();workspace=Workspace(demo=True,vision_reader=reader)
        try:
            image=workspace.read_image({'image':encoded_image()})
            self.assertTrue(reader.uri.startswith('data:image/jpeg;base64,'))
            sid=workspace.create_session()
            with patch('app.sample_visual',return_value={'kind':'steps'}):
                result=completed(workspace,sid,image['question'],attachment_id=image['attachment_id'])
            self.assertEqual(result['state']['draft']['result'],'2')
            self.assertIn('calculate',[event['node'] for event in result['state']['trace']])
            self.assertEqual(workspace.conversation(sid)['turns'][0]['result']['attachment']['thumbnail'],image['thumbnail'])
            self.assertNotIn('image',workspace.conversation(sid)['turns'][0]['result']['attachment'])
            with self.assertRaises(TutorError):workspace.send({'session_id':sid,'question':'مشتق چیست؟','attachment_id':'unknown'})
        finally:workspace.close()


if __name__=='__main__':unittest.main()
