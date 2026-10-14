"""Local SQLite conversations, with the core's successful-turn checkpoint."""
import json
from pathlib import Path
import sqlite3
import threading
from datetime import datetime, timezone


class HistoryStore:
    def __init__(self, path=None):
        if path:
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path) if path else ':memory:', check_same_thread=False)
        self.lock = threading.RLock()
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''
            PRAGMA foreign_keys=ON;
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY, title TEXT NOT NULL,
                created TEXT NOT NULL, updated TEXT NOT NULL, checkpoint TEXT NOT NULL DEFAULT '{}');
            CREATE TABLE IF NOT EXISTS turns (
                id INTEGER PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                question TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL);
        ''')

    def create(self, identifier):
        now = datetime.now(timezone.utc).isoformat()
        with self.lock, self.db:
            self.db.execute('INSERT INTO conversations(id,title,created,updated) VALUES(?,?,?,?)',
                            (identifier, 'گفت‌وگوی تازه', now, now))

    def append(self, identifier, question, result, checkpoint):
        now = datetime.now(timezone.utc).isoformat()
        with self.lock, self.db:
            count = self.db.execute('SELECT COUNT(*) FROM turns WHERE conversation_id=?', (identifier,)).fetchone()[0]
            self.db.execute('INSERT INTO turns(conversation_id,question,result,created) VALUES(?,?,?,?)',
                            (identifier, question, json.dumps(result, ensure_ascii=False, allow_nan=False), now))
            self.db.execute('UPDATE conversations SET updated=?, checkpoint=? WHERE id=?',
                            (now, json.dumps(checkpoint, ensure_ascii=False), identifier))
            if count == 0:
                self.db.execute('UPDATE conversations SET title=? WHERE id=?', (' '.join(question.split())[:80], identifier))

    def list(self):
        with self.lock:
            return [dict(row) for row in self.db.execute('''
                SELECT c.id,c.title,c.created,c.updated,COUNT(t.id) AS count
                FROM conversations c JOIN turns t ON t.conversation_id=c.id
                GROUP BY c.id ORDER BY c.updated DESC
            ''')]

    def get(self, identifier):
        with self.lock:
            row = self.db.execute('SELECT * FROM conversations WHERE id=?', (identifier,)).fetchone()
            if row is None:
                return None
            data = dict(row)
            data['checkpoint'] = json.loads(data['checkpoint'])
            data['turns'] = [dict(question=r['question'], result=json.loads(r['result']), created=r['created'])
                             for r in self.db.execute('SELECT * FROM turns WHERE conversation_id=? ORDER BY id', (identifier,))]
            return data

    def rename(self, identifier, title):
        if not isinstance(title, str) or not 1 <= len(title.strip()) <= 120:
            raise ValueError('Invalid title')
        with self.lock, self.db:
            if not self.db.execute('UPDATE conversations SET title=? WHERE id=?', (title.strip(), identifier)).rowcount:
                raise ValueError('Unknown conversation')

    def delete(self, identifier):
        with self.lock, self.db:
            self.db.execute('DELETE FROM conversations WHERE id=?', (identifier,))

    def close(self):
        self.db.close()
