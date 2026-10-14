"""Presentation instructions wrap, rather than modify, the original agent."""
from core_bridge import LLMProvider

MATH_FORMAT = r'''
For all human-readable introduction, steps, example and check_question strings:
write mathematics in LaTeX, enclosed in \( ... \) inline or \[ ... \] on its own line.
Use \frac, \sqrt, braced exponents/subscripts, \int, \sum and matrices where appropriate.
Keep Persian prose outside math delimiters. Never use backticks for math.
Keep the `result` field in the ORIGINAL simple symbolic format required by the schema/tools.
Keep tool expressions in Python/SymPy syntax, never LaTeX. JSON backslashes must be escaped.
Prefer 3–6 concise educational steps without repeating the same equation in prose.
'''


class UIProvider(LLMProvider):
    def structured(self, stage, instructions, context, schema):
        if stage in {'explain_concept', 'solve_problem', 'revise_answer'}:
            instructions += MATH_FORMAT
        return super().structured(stage, instructions, context, schema)
