"""Load the unchanged HW04 core; no browser-specific logic enters its graph."""
from pathlib import Path
import sys

CORE = Path(__file__).resolve().parent / 'tutor_core'
sys.path.insert(0, str(CORE))
from agent import MathTutorAgent, TutorSession  # noqa: E402
from provider import LLMProvider, TutorError, load_settings  # noqa: E402

__all__ = ['MathTutorAgent', 'TutorSession', 'LLMProvider', 'TutorError', 'load_settings']
