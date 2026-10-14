"""Schema-driven UI planning and bounded, deterministic visual computations."""
from __future__ import annotations
import json
import math
import re
from pathlib import Path
import subprocess
import sys
from typing import Literal

from core_bridge import TutorError
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Parameter(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    name: Literal['a', 'b', 'c', 'y', 'z', 't', 'n']
    label: str = Field(max_length=70)
    minimum: float = Field(default=-5, ge=-50, le=50)
    maximum: float = Field(default=5, ge=-50, le=50)
    value: float = Field(default=1, ge=-50, le=50)
    step: float = Field(default=0.1, ge=0.01, le=10)

    @model_validator(mode='after')
    def bounds(self):
        if not self.minimum < self.maximum or not self.minimum <= self.value <= self.maximum:
            raise ValueError('Invalid parameter range.')
        return self


class Formula(BaseModel):
    model_config = ConfigDict(extra='forbid')
    label: str = Field(max_length=80)
    latex: str = Field(max_length=600)


class VisualSpec(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    kind: Literal['steps', 'function', 'tangent', 'integral', 'geometry', 'matrix'] = 'steps'
    title: str = Field(default='قدم‌به‌قدم تا درک مسئله', max_length=120)
    caption: str = Field(default='', max_length=600)
    expression: str = Field(default='', max_length=400)
    x_min: float = Field(default=-4, ge=-50, le=50)
    x_max: float = Field(default=4, ge=-50, le=50)
    focus: float = Field(default=1, ge=-50, le=50)
    lower: float = Field(default=0, ge=-50, le=50)
    upper: float = Field(default=2, ge=-50, le=50)
    shape: Literal['right_triangle', 'circle'] = 'right_triangle'
    parameters: list[Parameter] = Field(default_factory=list, max_length=4)
    matrix: list[list[float]] = Field(default_factory=list, max_length=4)
    formulas: list[Formula] = Field(default_factory=list, max_length=5)

    @model_validator(mode='after')
    def valid(self):
        if not self.x_min < self.x_max or self.x_max - self.x_min > 60:
            raise ValueError('Invalid plot domain.')
        if len({p.name for p in self.parameters}) != len(self.parameters):
            raise ValueError('Duplicate parameters.')
        if self.kind in {'function', 'tangent', 'integral'} and not self.expression.strip():
            raise ValueError('An expression is required.')
        if self.kind == 'integral' and not self.x_min <= self.lower < self.upper <= self.x_max:
            raise ValueError('Integral bounds must lie in the plot domain.')
        if self.kind == 'tangent' and not self.x_min <= self.focus <= self.x_max:
            raise ValueError('Tangent point must lie in the plot domain.')
        if self.kind == 'matrix' and (not self.matrix or any(len(row) != len(self.matrix) for row in self.matrix)):
            raise ValueError('Matrix must be square and at most 4 by 4.')
        if any(not math.isfinite(v) or abs(v) > 1e6 for row in self.matrix for v in row):
            raise ValueError('Matrix values are outside the supported range.')
        if self.kind == 'geometry' and any(p.minimum <= 0 for p in self.parameters):
            raise ValueError('Geometric lengths must be positive.')
        return self


def fallback_spec(state: dict) -> VisualSpec:
    tool = state.get('analysis', {}).get('tool_request') or {}
    op, expression = tool.get('operation'), tool.get('expression', '')
    if tool.get('variable', 'x') != 'x':
        return VisualSpec()
    if op == 'differentiate':
        return VisualSpec(kind='tangent', title='مشتق را روی نمودار ببین', expression=expression,
                          caption='نقطه را جابه‌جا کن؛ شیب خط مماس همان مشتق در آن نقطه است.')
    if op == 'integrate':
        try:
            a, b = float(tool.get('lower_bound') or 0), float(tool.get('upper_bound') or 2)
            if a >= b:
                return VisualSpec()
            return VisualSpec(kind='integral', title='انتگرال؛ انباشت زیر نمودار', expression=expression,
                              lower=a, upper=b, x_min=min(-2, a-1), x_max=max(4, b+1),
                              caption='کران‌ها را تغییر بده و مقدار انباشت علامت‌دار را بررسی کن.')
        except (ValueError, TypeError):
            return VisualSpec()
    if op == 'simplify':
        return VisualSpec(kind='function', title='رفتار تابع', expression=expression)
    if op == 'determinant':
        try:
            return VisualSpec(kind='matrix', title='ساختار ماتریس', matrix=json.loads(expression))
        except (ValueError, TypeError):
            return VisualSpec()
    return VisualSpec()


def choose_visual(provider, state: dict) -> tuple[VisualSpec, str]:
    if state['status'] != 'answered':
        return VisualSpec(), 'none'
    try:
        spec = provider.structured('design_visual',
            'Design a helpful visual UI for the ACCEPTED mathematics lesson. Output only the schema. '
            'Use tangent for differentiation, integral for integration, function for functions or optimization, '
            'geometry for right triangles/circles, matrix for small square matrices, steps for other topics. '
            'Use only explicit arithmetic and sin/cos/tan/exp/log/ln/sqrt/abs in expression. '
            'The horizontal variable MUST be x; tunable symbols may only be a,b,c,y,z,t,n. '
            'For every extra symbol include a parameter. For a concept, use a simple ILLUSTRATIVE example '
            'and explicitly label it as an example in the caption. Never invent a missing user equation. '
            'For an explicit calculation preserve the original function and numbers. '
            'For right_triangle parameters y and z are the two positive legs; for circle y is positive radius. '
            'Parameter minimum must be positive for geometry. Matrix entries must be numeric. '
            'When unsupported or uncertain use steps. All prose must be Persian. '
            'Optional formulas are LaTeX strings only, no HTML/JS/URLs. Keep the UI concise. '
            'Defaults: domain [-4,4], tangent focus 1, integral bounds [0,2]. '
            'Integral domain must include both ordered bounds and tangent focus must lie in domain.',
            {'question': state['question'], 'original': state['raw_request'], 'analysis': state['analysis'],
             'answer': state['draft'], 'level': state['learner_level']}, VisualSpec)
        # A graph-produced tool request remains authoritative for a concrete calculus problem.
        tool = state['analysis'].get('tool_request') or {}
        if state['analysis']['request_kind'] == 'problem' and tool.get('operation') in {'differentiate', 'integrate'}:
            canonical = fallback_spec(state)
            if canonical.kind != 'steps':
                spec = canonical
        return spec, 'model'
    except (TutorError, ValueError):
        return fallback_spec(state), 'fallback'


def compute_visual(spec: VisualSpec) -> dict:
    """Executed in the child worker. Never evaluate model-authored code."""
    import sympy as sp
    from math_tools import SYMBOLS, parse_expression
    if spec.kind == 'steps':
        return {'kind': 'steps'}
    if spec.kind == 'geometry':
        values = {p.name: p.value for p in spec.parameters}
        a, b = values.get('y', 3), values.get('z', 4)
        if a <= 0 or b <= 0:
            raise ValueError('Lengths must be positive.')
        if spec.shape == 'circle':
            return {'kind': 'geometry', 'shape': 'circle', 'radius': a,
                    'area': math.pi*a*a, 'perimeter': 2*math.pi*a,
                    'latex': r'A=\pi r^2', 'metrics': [{'label':'مساحت', 'value':round(math.pi*a*a, 4)},
                    {'label':'محیط', 'value':round(2*math.pi*a, 4)}]}
        c = math.hypot(a, b)
        return {'kind':'geometry', 'shape':'right_triangle', 'a':a, 'b':b, 'c':c,
                'latex':r'c=\sqrt{a^2+b^2}', 'metrics':[{'label':'وتر', 'value':round(c, 4)},
                {'label':'مساحت', 'value':round(a*b/2, 4)}]}
    if spec.kind == 'matrix':
        matrix = sp.Matrix(spec.matrix)
        return {'kind':'matrix', 'matrix':spec.matrix, 'latex':sp.latex(matrix),
                'metrics':[{'label':'دترمینان', 'value':float(matrix.det())}]}
    x = SYMBOLS['x']
    # Map at most four UI parameter names into the unchanged parser's four
    # allowed auxiliary symbols. One simultaneous replacement avoids collisions.
    names = {p.name for p in spec.parameters}
    referenced = set(re.findall(r'\b[A-Za-z_][A-Za-z_0-9]*\b', spec.expression))
    if referenced.intersection({'a','b','c','y','z','t','n'}) - names:
        raise ValueError('Every additional variable needs a parameter.')
    aliases = {p.name:slot for p,slot in zip(spec.parameters, ['y','z','t','n'])}
    mapped = re.sub(r'\b[A-Za-z_][A-Za-z_0-9]*\b', lambda m:aliases.get(m[0],m[0]), spec.expression)
    expression = parse_expression(mapped)
    substitutions = {SYMBOLS[aliases[p.name]]:sp.Rational(str(p.value)) for p in spec.parameters}
    expression = expression.subs(substitutions)
    if expression.free_symbols - {x}:
        raise ValueError('Every additional variable needs a parameter.')
    derivative = sp.diff(expression, x)
    # lambdify input is a bounded symbolic expression built by our allowlist parser.
    fn = sp.lambdify(x, expression, modules='math', cse=False)
    dfn = sp.lambdify(x, derivative, modules='math', cse=False)
    def value(function, point):
        try:
            v = float(function(point))
            return v if math.isfinite(v) and abs(v) <= 1e5 else None
        except (ValueError, TypeError, ZeroDivisionError, OverflowError):
            return None
    # Break curves at known denominator singularities; do not draw across poles.
    poles = []
    denominator = sp.denom(sp.together(expression))
    if denominator != 1 and denominator.is_polynomial(x) and sp.degree(denominator, x) <= 6:
        roots = sp.solveset(denominator, x, domain=sp.S.Reals)
        if isinstance(roots, sp.FiniteSet):
            poles = [float(p) for p in roots if p.is_real]
    points = []
    previous = None
    for i in range(301):
        point = spec.x_min + (spec.x_max-spec.x_min)*i/300
        y = value(fn, point)
        if previous is not None and any(previous <= p <= point for p in poles):
            points.append([point, None])
        points.append([point, y])
        previous = point
    valid = [p for p in points if p[1] is not None]
    if not valid:
        raise ValueError('No real finite points in this domain.')
    result = {'kind':spec.kind, 'points':points, 'latex':r'f(x)='+sp.latex(expression),
              'derivative_latex':r"f'(x)="+sp.latex(derivative), 'metrics':[]}
    if spec.kind == 'tangent':
        y, slope = value(fn, spec.focus), value(dfn, spec.focus)
        if y is None or slope is None:
            raise ValueError('Tangent is undefined at the selected point.')
        result.update(focus=[spec.focus, y], slope=slope,
                      tangent=[[spec.x_min, y+slope*(spec.x_min-spec.focus)],
                               [spec.x_max, y+slope*(spec.x_max-spec.focus)]],
                      metrics=[{'label':'شیب مماس', 'value':round(slope, 4)},
                               {'label':'مقدار تابع', 'value':round(y, 4)}])
    if spec.kind == 'integral':
        # Reject intervals crossing poles instead of presenting a misleading area.
        if any(spec.lower <= p <= spec.upper for p in poles):
            raise ValueError('The interval crosses a singularity.')
        integral = sp.integrate(expression, (x, spec.lower, spec.upper))
        try:
            total = float(integral)
        except (ValueError, TypeError):
            raise ValueError('The definite integral is not a finite real value.') from None
        if not math.isfinite(total):
            raise ValueError('The definite integral diverges.')
        result.update(integral=total, integral_latex=sp.latex(sp.Integral(expression, (x, spec.lower, spec.upper)))+'='+sp.latex(integral),
                      area=[[spec.lower+(spec.upper-spec.lower)*i/160,
                             value(fn, spec.lower+(spec.upper-spec.lower)*i/160)] for i in range(161)],
                      metrics=[{'label':'انتگرال علامت‌دار', 'value':round(total, 4)}])
    return result


def sample_visual(spec: VisualSpec, timeout=7) -> dict:
    try:
        process = subprocess.run([sys.executable, '-X', 'utf8', str(Path(__file__).resolve()), '--worker'],
                                 input=spec.model_dump_json(), encoding='utf-8',
                                 capture_output=True, timeout=timeout, check=False)
        data = json.loads(process.stdout)
        if process.returncode or 'error' in data:
            raise ValueError(data.get('error', 'Visual calculation failed.'))
        return data
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError):
        raise ValueError('Visual calculation is unavailable or exceeded its time limit.') from None


if __name__ == '__main__' and sys.argv[1:] == ['--worker']:
    try:
        spec = VisualSpec.model_validate_json(sys.stdin.read(24000))
        print(json.dumps(compute_visual(spec), ensure_ascii=True, allow_nan=False))
    except Exception:
        # Do not leak provider settings or raw process internals to the browser.
        print(json.dumps({'error':'این نمایش در بازهٔ انتخاب‌شده قابل محاسبه نیست؛ بازه یا پارامتر را تغییر بده.'}))
