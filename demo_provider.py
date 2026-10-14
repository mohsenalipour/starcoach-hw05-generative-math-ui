"""Explicit offline examples running THROUGH the same LangGraph, for demos/tests."""
from core_bridge import TutorError
from visuals import VisualSpec


class DemoProvider:
    def __init__(self):
        self.mode = 'tangent'

    def structured(self, stage, instructions, context, schema):
        if stage == 'analyze_request':
            q = context['question']
            if any(w in q for w in ['مثلث', 'فیثاغورس', 'triangle']): self.mode = 'geometry'
            elif any(w in q for w in ['دایره', 'circle']): self.mode = 'circle'
            elif any(w in q for w in ['انتگرال', 'integral', 'integrate']): self.mode = 'integral'
            elif any(w in q for w in ['ماتریس', 'matrix']): self.mode = 'matrix'
            elif any(w in q for w in ['مشتق', 'derivative', 'differentiate', 'شیب']): self.mode = 'tangent'
            elif any(w in q for w in ['معادله', 'equation', '2*x + 3']): self.mode = 'equation'
            elif any(w in q for w in ['پارامتر', 'ضریب', 'تابع', 'function']): self.mode = 'function'
            else: raise TutorError('در دموی آفلاین یکی از نمونه‌های آماده را انتخاب کن؛ برای سؤال آزاد برنامه را بدون --demo اجرا کن.')
            tool = None
            if self.mode == 'integral': tool = {'operation':'integrate', 'expression':'x**2', 'lower_bound':'0', 'upper_bound':'2'}
            if self.mode == 'tangent' and 'x^3' in q: tool = {'operation':'differentiate', 'expression':'x**3 + 2*x'}
            if self.mode == 'matrix': tool = {'operation':'determinant', 'expression':'[[1,2],[3,4]]'}
            clarify = self.mode == 'equation' and 'Previous incomplete request' not in q and '2*x' not in q
            if self.mode == 'equation' and not clarify: tool = {'operation':'solve', 'expression':'2*x + 3 = 7'}
            return schema.model_validate({'request_kind':'problem' if tool or clarify else 'concept', 'topic':self.mode,
                'normalized_question':q, 'learner_level':'beginner', 'needs_clarification':clarify,
                'clarification_question':'خود معادله را بنویس تا مرحله‌به‌مرحله حل کنیم.' if clarify else '', 'tool_request':tool})
        if stage == 'plan_lesson':
            return schema.model_validate({'objective':'درک شهودی با یک مثال بصری', 'prerequisites':['آشنایی با عدد و تابع'],
                'analogy':'حرکت و اندازه‌گیری تغییرات', 'steps':['دیدن مثال', 'فهم رابطه', 'بررسی نتیجه']})
        if stage in {'explain_concept', 'solve_problem', 'revise_answer'}:
            lessons = {
                'tangent':('مشتق می‌گوید تابع در یک نقطه با چه سرعتی تغییر می‌کند؛ مانند سرعت لحظه‌ای یک حرکت.',
                    ['تابع را مثل مسیری در نظر بگیر که ارتفاعش با x تغییر می‌کند.', 'خط مماس جهت حرکت در همان نقطه را نشان می‌دهد.',
                     r'برای توان x، توان را ضریب می‌کنیم و یکی از آن کم می‌کنیم: \(\frac{d}{dx}x^n=nx^{n-1}\).'],
                    'برای f(x)=x²، در x=1 شیب برابر ۲ است؛ نقطه را روی نمودار جابه‌جا کن.', '3*x**2 + 2'),
                'integral':('انتگرال یعنی جمع کردن سهم‌های کوچک برای به دست آوردن یک مقدار انباشته.',
                    ['تابع مثال f(x)=x² را از صفر تا دو نگاه کن.', 'مستطیل‌های باریک زیر نمودار سهم هر بخش را تقریب می‌زنند.',
                     'پادمشتق x² برابر x³/3 است. اختلاف مقدار در دو کران برابر ۸/۳ می‌شود.'],
                    'ناحیهٔ رنگی با تغییر کران‌ها تغییر می‌کند؛ زیر محور سهم منفی دارد.', '8/3'),
                'geometry':('در مثلث قائم‌الزاویه، طول دو ضلع کوتاه و وتر با رابطهٔ فیثاغورس به هم وصل‌اند.',
                    ['دو ضلع عمود را a و b می‌نامیم.', r'رابطهٔ فیثاغورس \(a^2+b^2=c^2\) است.',
                     'برای ضلع‌های ۳ و ۴، وتر برابر ۵ می‌شود.'], 'طول ضلع‌ها را با کنترل‌ها تغییر بده و اندازهٔ وتر را مقایسه کن.', ''),
                'circle':('مساحت دایره با مربع شعاع تغییر می‌کند؛ دو برابر شدن شعاع مساحت را چهار برابر می‌کند.',
                    ['شعاع فاصلهٔ مرکز تا محیط است.', r'مساحت از رابطهٔ \(A=\pi r^2\) به دست می‌آید.',
                     r'محیط برابر \(2\pi r\) است و رشد خطی دارد.'], 'شعاع را تغییر بده و رشد مساحت را ببین.', ''),
                'function':('ضریب یک تابع شکل نمودار را تغییر می‌دهد. برای مثال، در f(x)=a x²+b می‌توان دو اثر را جدا دید.',
                    ['ضریب a کشیدگی و جهت سهمی را تغییر می‌دهد.', 'عدد b نمودار را بالا و پایین می‌برد.',
                     'وقتی a مثبت باشد سهمی رو به بالا و وقتی منفی باشد رو به پایین است.'],
                    'هر پارامتر را جدا تغییر بده و اثر آن را مقایسه کن.', ''),
                'equation':('هدف این است که x تنها بماند و تساوی حفظ شود.',
                    ['از دو طرف معادله ۳ کم می‌کنیم: 2x=4.', 'دو طرف را بر ۲ تقسیم می‌کنیم: x=2.',
                     'با جایگذاری، ۲×۲+۳=۷ می‌شود.'], 'هر عملی باید روی هر دو طرف انجام شود.', '2'),
                'matrix':('دترمینان یک عدد است که بخشی از رفتار تبدیل خطی ماتریس را توصیف می‌کند.',
                    ['برای ماتریس دو در دو از رابطهٔ ad−bc استفاده می‌کنیم.', 'در مثال، ۱×۴−۲×۳ برابر منفی ۲ است.',
                     'علامت منفی تغییر جهت و قدرمطلق ۲ ضریب تغییر مساحت را نشان می‌دهد.'], 'ورودی‌های ماتریس در نمایش مشخص‌اند.', '-2'),
            }
            intro, steps, example, result = lessons[self.mode]
            if context.get('learner_level') == 'advanced':
                steps.append('در تحلیل دقیق‌تر، فرض‌ها و دامنهٔ تعریف تابع نیز باید بررسی شوند.')
            return schema.model_validate({'introduction':intro, 'steps':steps, 'example':example,
                'result':'' if schema.__name__ == 'ConceptAnswer' else result,
                'check_question':'با تغییر یک پارامتر، چه تغییری در نتیجه مشاهده می‌کنی؟'})
        if stage == 'review_answer':
            return schema.model_validate({'accepted':True, 'issues':[], 'needs_clarification':False, 'clarification_question':''})
        if stage == 'design_visual':
            if self.mode in {'geometry','circle'}:
                ps = [{'name':'y','label':'شعاع' if self.mode=='circle' else 'ضلع افقی a','minimum':0.5,'maximum':10,'value':3,'step':0.1}]
                if self.mode == 'geometry': ps.append({'name':'z','label':'ضلع عمودی b','minimum':0.5,'maximum':10,'value':4,'step':0.1})
                return VisualSpec(kind='geometry', title='هندسه را لمس کن', shape='circle' if self.mode=='circle' else 'right_triangle', parameters=ps,
                    caption='این شکل یک مثال آموزشی است؛ طول‌ها را تغییر بده و رابطه را بررسی کن.')
            if self.mode == 'function':
                return VisualSpec(kind='function', title='آزمایشگاه پارامترها', expression='y*x**2 + z',
                    caption='مثال آموزشی f(x)=a x²+b؛ اثر هر ضریب را جدا بررسی کن.', parameters=[
                    {'name':'y','label':'ضریب a','minimum':-3,'maximum':3,'value':1,'step':0.1},
                    {'name':'z','label':'جابجایی b','minimum':-4,'maximum':4,'value':0,'step':0.1}])
            if self.mode == 'integral': return VisualSpec(kind='integral', title='انتگرال را ببین', expression='x**2', caption='مقدار علامت‌دار انباشت در بازهٔ انتخابی.')
            if self.mode == 'tangent': return VisualSpec(kind='tangent', title='شیب لحظه‌ای؛ از تصویر تا مشتق', expression='x**2', caption='مثال آموزشی: نقطه را روی تابع جابه‌جا کن.')
            if self.mode == 'matrix': return VisualSpec(kind='matrix', title='ساختار ماتریس', matrix=[[1,2],[3,4]])
            return VisualSpec()
        raise TutorError('Unsupported offline stage.')

    def close(self):
        pass
