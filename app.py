"""Loopback-only browser UI over the unchanged HW04 mathematics agent."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import secrets
import threading
import time
from urllib.parse import urlparse, unquote
import webbrowser

from core_bridge import MathTutorAgent, TutorSession, LLMProvider, TutorError, load_settings
from demo_provider import DemoProvider
from visuals import VisualSpec, choose_visual, sample_visual
from history import HistoryStore
from ui_provider import UIProvider
from image_input import VisionReader, prepare_image, MAX_IMAGE_BYTES

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / 'static'
# Keep UTF-8 inherited by the unchanged core's calculation subprocess on Windows.
os.environ.setdefault('PYTHONUTF8', '1')


@dataclass
class Conversation:
    session: TutorSession
    provider: object
    touched: float = field(default_factory=time.monotonic)
    busy: bool = False


class Workspace:
    def __init__(self, *, demo=False, provider_factory=None, db_path=None, vision_reader=None):
        self.demo = demo
        self.store = HistoryStore(db_path)
        self.vision = vision_reader
        self.uploads = {}
        self.image_slots = threading.BoundedSemaphore(2)
        self.config_error = ''
        self.model = 'دموی آفلاین' if demo else ''
        if provider_factory:
            self.factory = provider_factory
        elif demo:
            self.factory = DemoProvider
        else:
            try:
                settings = load_settings(ROOT / '.env')
                self.model = settings.model
                self.factory = lambda: UIProvider(settings)
                self.vision = vision_reader or VisionReader(settings, os.getenv('VISION_MODEL', 'gpt-4.1-mini'))
            except TutorError:
                self.config_error = 'تنظیمات مدل آماده نیست. فایل .env را طبق README تنظیم کن و برنامه را دوباره اجرا کن.'
                self.factory = None
        self.lock = threading.RLock()
        self.sessions: dict[str, Conversation] = {}
        self.jobs: dict[str, dict] = {}
        self.pool = ThreadPoolExecutor(max_workers=3, thread_name_prefix='math-tutor')
        self.samples = threading.BoundedSemaphore(2)

    def create_session(self):
        with self.lock:
            now = time.monotonic()
            for key, conv in list(self.sessions.items()):
                if not conv.busy and now-conv.touched > 3600:
                    conv.provider.close()
                    del self.sessions[key]
            self.jobs = {k:v for k,v in self.jobs.items() if now-v['created'] < 3600 or v['status']=='running'}
            if len(self.sessions) >= 24:
                idle = next((key for key, conv in self.sessions.items() if not conv.busy), None)
                if idle is None:
                    raise TutorError('تا پایان پاسخ فعلی صبر کن.')
                self.sessions.pop(idle).provider.close()
            if not self.factory:
                raise TutorError(self.config_error)
            provider = self.factory()
            identifier = secrets.token_urlsafe(24)
            self.sessions[identifier] = Conversation(TutorSession(MathTutorAgent(provider), language='fa'), provider)
            self.store.create(identifier)
            return identifier

    def conversation(self, identifier):
        record = self.store.get(identifier)
        if not record:
            raise TutorError('گفت‌وگو پیدا نشد.')
        return {k:v for k,v in record.items() if k != 'checkpoint'}

    def restore(self, identifier):
        if identifier in self.sessions:
            return self.sessions[identifier]
        record = self.store.get(identifier)
        if not record or not self.factory:
            raise TutorError('گفت‌وگو یا تنظیمات مدل در دسترس نیست.')
        if len(self.sessions) >= 24:
            idle = next((key for key, conv in self.sessions.items() if not conv.busy), None)
            if idle is None:
                raise TutorError('تا پایان پاسخ فعلی صبر کن.')
            self.sessions.pop(idle).provider.close()
        provider = self.factory()
        session = TutorSession(MathTutorAgent(provider), language='fa')
        for key in ('history', 'pending_request', 'previous_level', 'last_state', 'level', 'language'):
            if key in record['checkpoint']:
                setattr(session, key, record['checkpoint'][key])
        conv = self.sessions[identifier] = Conversation(session, provider)
        return conv

    def read_image(self, payload):
        if not self.vision:
            raise TutorError('خواندن عکس در حالت آفلاین فعال نیست. برنامه را با تنظیمات مدل اجرا کن.')
        if not self.image_slots.acquire(blocking=False):
            raise TutorError('دو عکس در حال خواندن‌اند؛ کمی بعد دوباره امتحان کن.')
        try:
            uri, thumbnail = prepare_image(payload.get('image'))
            result = self.vision.read(uri)
            identifier = secrets.token_urlsafe(24)
            with self.lock:
                now = time.monotonic()
                self.uploads = {k:v for k,v in self.uploads.items() if now-v['created'] < 3600}
                if len(self.uploads) >= 24:
                    self.uploads.pop(next(iter(self.uploads)))
                self.uploads[identifier] = {'created':now, 'thumbnail':thumbnail}
            return {**result, 'attachment_id':identifier, 'thumbnail':thumbnail}
        finally:
            self.image_slots.release()

    def send(self, payload):
        question = payload.get('question', '')
        if not isinstance(question, str) or not question.strip() or len(question) > 4000:
            raise TutorError('سؤال باید بین ۱ تا ۴۰۰۰ نویسه داشته باشد.')
        level, language = payload.get('level','auto'), payload.get('language','fa')
        if level not in {'auto','beginner','intermediate','advanced'} or language not in {'fa','en','auto'}:
            raise TutorError('سطح یا زبان معتبر نیست.')
        with self.lock:
            identifier = payload.get('session_id')
            if not isinstance(identifier, str):
                raise TutorError('گفت‌وگو پیدا نشد.')
            conv = self.restore(identifier)
            attachment = None
            if payload.get('attachment_id'):
                attachment = self.uploads.get(payload['attachment_id'])
                if not attachment or time.monotonic()-attachment['created'] > 3600:
                    raise TutorError('عکس منقضی شده است؛ دوباره آن را اضافه کن.')
                attachment = {'thumbnail':attachment['thumbnail']}
            if conv.busy:
                raise TutorError('پاسخ قبلی هنوز در حال آماده شدن است.')
            conv.busy = True
            conv.touched = time.monotonic()
            conv.session.level, conv.session.language = level, language
            job_id = secrets.token_urlsafe(24)
            self.jobs[job_id] = {'created':time.monotonic(), 'session_id':payload['session_id'],
                                 'status':'running', 'nodes':[], 'stage':'analyze_request'}
        self.pool.submit(self._run, conv, job_id, question.strip(), attachment)
        return job_id

    def _run(self, conv, job_id, question, attachment=None):
        checkpoint_keys = ('history', 'pending_request', 'previous_level', 'last_state', 'level', 'language')
        before = {key:deepcopy(getattr(conv.session,key)) for key in checkpoint_keys}
        def progress(name):
            with self.lock:
                self.jobs[job_id]['stage'] = name
                self.jobs[job_id]['nodes'].append(name)
        conv.session.agent.on_node = progress
        try:
            state = conv.session.send(question)
            progress('design_visual')
            spec, source = choose_visual(conv.provider, state)
            warning = ''
            try:
                data = sample_visual(spec)
            except ValueError:
                spec, data = VisualSpec(), {'kind':'steps'}
                warning = 'نمایش بصری این سؤال قابل محاسبه نبود؛ توضیح و مراحل پاسخ در دسترس‌اند.'
            result = {'state':state, 'visual':spec.model_dump(), 'data':data,
                      'visual_source':source, 'warning':warning, 'demo':self.demo, 'attachment':attachment}
            with self.lock:
                checkpoint = {key:getattr(conv.session, key) for key in checkpoint_keys}
                self.store.append(self.jobs[job_id]['session_id'], question, result, checkpoint)
                self.jobs[job_id].update(status='completed', result=result)
        except TutorError as error:
            with self.lock:
                for key, value in before.items():
                    setattr(conv.session, key, value)
                self.jobs[job_id].update(status='error', error=str(error))
        except Exception:
            with self.lock:
                for key, value in before.items():
                    setattr(conv.session, key, value)
                self.jobs[job_id].update(status='error', error='اجرای این سؤال کامل نشد. دوباره امتحان کن یا سؤال را ساده‌تر بنویس.')
        finally:
            with self.lock:
                conv.busy = False
                conv.touched = time.monotonic()

    def job(self, identifier, session_id):
        with self.lock:
            job = self.jobs.get(identifier)
            if not job or job['session_id'] != session_id:
                raise TutorError('اجرای موردنظر پیدا نشد.')
            return deepcopy({k:v for k,v in job.items() if k not in {'created','session_id'}})

    def clear(self, identifier):
        with self.lock:
            conv = self.sessions.get(identifier)
            if not conv:
                return
            if conv.busy:
                raise TutorError('تا پایان پاسخ فعلی صبر کن.')
            conv.provider.close()
            del self.sessions[identifier]

    def delete(self, identifier):
        with self.lock:
            self.clear(identifier)
            self.store.delete(identifier)

    def close(self):
        self.pool.shutdown(wait=True, cancel_futures=True)
        for conv in self.sessions.values():
            conv.provider.close()
        if self.vision:
            self.vision.close()
        self.store.close()


def make_handler(workspace):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'MiloMath/1.0'
        def log_message(self, *args):
            pass  # Neither questions nor credentials are written to request logs.

        def valid_origin(self):
            allowed = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            if self.headers.get('Host') not in allowed:
                return False
            origin = self.headers.get('Origin')
            return not origin or origin in {f'http://{h}' for h in allowed}

        def respond(self, data, code=200):
            body = json.dumps(data, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type','application/json; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.valid_origin():
                return self.respond({'error':'Invalid origin.'}, 403)
            parsed = urlparse(self.path)
            if parsed.path == '/api/health':
                return self.respond({'ready':not workspace.config_error, 'demo':workspace.demo,
                                     'model':workspace.model, 'message':workspace.config_error,
                                     'vision':bool(workspace.vision), 'vision_model':getattr(workspace.vision,'model','')})
            if parsed.path == '/api/history':
                return self.respond({'conversations':workspace.store.list()})
            if parsed.path.startswith('/api/conversations/'):
                try:
                    return self.respond(workspace.conversation(parsed.path.rsplit('/',1)[1]))
                except TutorError as error:
                    return self.respond({'error':str(error)},404)
            if parsed.path.startswith('/api/jobs/'):
                from urllib.parse import parse_qs
                try:
                    job = workspace.job(parsed.path.rsplit('/',1)[1], parse_qs(parsed.query).get('session_id',[''])[0])
                    return self.respond(job)
                except TutorError as error:
                    return self.respond({'error':str(error)}, 404)
            relative = 'index.html' if parsed.path == '/' else unquote(parsed.path).removeprefix('/static/')
            if parsed.path != '/' and not parsed.path.startswith('/static/'):
                return self.respond({'error':'Not found.'}, 404)
            target = (STATIC / relative).resolve()
            if not target.is_relative_to(STATIC.resolve()) or not target.is_file():
                return self.respond({'error':'Not found.'}, 404)
            body = target.read_bytes()
            self.send_response(200)
            content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length',str(len(body)))
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_POST(self):
            try:
                length = int(self.headers.get('Content-Length', '0'))
                limit = MAX_IMAGE_BYTES * 4 // 3 + 4096 if self.path == '/api/images' else 26000
                if not 0 < length <= limit or self.headers.get('Content-Type','').split(';')[0] != 'application/json':
                    return self.respond({'error':'Invalid JSON request.'}, 400)
                # Drain a bounded body before refusing it; unread bodies can cause
                # TCP resets that hide the 403 response on Windows.
                self.connection.settimeout(10)
                raw = self.rfile.read(length)
                if not self.valid_origin():
                    return self.respond({'error':'Invalid origin.'}, 403)
                payload = json.loads(raw)
                if not isinstance(payload, dict):
                    raise ValueError('Expected an object.')
                if self.path == '/api/sessions':
                    return self.respond({'session_id':workspace.create_session()}, 201)
                if self.path == '/api/messages':
                    return self.respond({'job_id':workspace.send(payload)}, 202)
                if self.path == '/api/reset':
                    workspace.clear(payload.get('session_id'))
                    return self.respond({'ok':True})
                if self.path == '/api/images':
                    return self.respond(workspace.read_image(payload))
                if self.path == '/api/conversations/delete':
                    workspace.delete(payload.get('session_id'))
                    return self.respond({'ok':True})
                if self.path == '/api/conversations/rename':
                    workspace.store.rename(payload.get('session_id'),payload.get('title'))
                    return self.respond({'ok':True})
                if self.path == '/api/visual':
                    spec = VisualSpec.model_validate(payload.get('visual'))
                    if not workspace.samples.acquire(blocking=False):
                        return self.respond({'error':'محاسبهٔ قبلی هنوز در حال انجام است.'}, 429)
                    try:
                        return self.respond({'data':sample_visual(spec)})
                    finally:
                        workspace.samples.release()
                return self.respond({'error':'Not found.'}, 404)
            except (ValueError, TypeError, KeyError):
                return self.respond({'error':'ورودی یا بازهٔ نمایش معتبر نیست.'}, 400)
            except TutorError as error:
                return self.respond({'error':str(error)}, 400)
    return Handler


def main():
    parser = argparse.ArgumentParser(description='MILO Generative Math UI')
    parser.add_argument('--port', type=int, default=8505)
    parser.add_argument('--demo', action='store_true', help='Clearly labelled offline examples, through the same graph')
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    workspace = Workspace(demo=args.demo, db_path=ROOT / 'data' / ('demo-history.sqlite3' if args.demo else 'history.sqlite3'))
    try:
        server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(workspace))
    except OSError:
        print(f'Port {args.port} is occupied. Close the previous app or use --port 8506.')
        workspace.close()
        return 1
    print(f'MILO Math UI: http://127.0.0.1:{args.port}', flush=True)
    print('Offline example mode' if args.demo else 'Live LangGraph tutor', flush=True)
    if not args.no_browser:
        threading.Timer(0.8, lambda:webbrowser.open(f'http://127.0.0.1:{args.port}')).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        workspace.close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
