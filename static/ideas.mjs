export const ideaCategories = [
  ['all','همهٔ ایده‌ها'],['calculus','حسابان'],['functions','توابع'],
  ['geometry','هندسه'],['algebra','جبر و بردار'],['concepts','مفاهیم']
];

// Preview graphics are illustrations; only the tutor solves the chosen prompt.
export const ideaCatalog = [
  {id:'tangent',category:'calculus',title:'مشتق، با یک نگاه',description:'شیب لحظه‌ای را در حرکت نقطه کشف کن.',view:'خط مماس',preview:'tangent',demo:true,
   prompt:'مشتق چیست؟ با یک مثال ساده توضیح بده و کمک کن شیب لحظه‌ای را روی نمودار ببینم.'},
  {id:'integral',category:'calculus',title:'انتگرال را لمس کن',description:'از سهم‌های کوچک، به یک مقدار کل برس.',view:'سطح زیر نمودار',preview:'area',demo:true,
   prompt:'انتگرال x^2 از صفر تا دو را مرحله‌به‌مرحله حساب کن و مفهوم انباشت را با سطح رنگی زیر نمودار نشان بده.'},
  {id:'geometry',category:'geometry',title:'هندسهٔ زنده',description:'ضلع‌ها را تغییر بده؛ رابطه را ببین.',view:'مثلث تعاملی',preview:'triangle',demo:true,
   prompt:'قضیهٔ فیثاغورس را با یک مثلث قائم‌الزاویه با ضلع‌های ۳ و ۴ ساده توضیح بده.'},
  {id:'function',category:'functions',title:'اگر ضریب عوض شود؟',description:'یک سهمی، چند رفتار متفاوت.',view:'کنترل ضرایب',preview:'parabola',demo:true,
   prompt:'اثر تغییر ضریب‌ها در تابع f(x)=a*x^2+b را با یک مثال تعاملی توضیح بده.'},
  {id:'circle',category:'geometry',title:'یک شعاع، دو رابطه',description:'رشد محیط و مساحت را مقایسه کن.',view:'دایره و شعاع',preview:'circle',demo:true,
   prompt:'مساحت و محیط دایره را با یک مثال ساده توضیح بده و با تغییر شعاع نشان بده چرا مساحت سریع‌تر رشد می‌کند.'},
  {id:'wave',category:'functions',title:'ریاضیِ یک موج',description:'دامنه و دوره چه چیزی را تغییر می‌دهند؟',view:'نمودار سینوسی',preview:'wave',
   prompt:'تابع f(x)=a*sin(b*x) را با نمودار تعاملی توضیح بده؛ ضریب‌های a و b چه اثری روی دامنه و دوره دارند؟'},
  {id:'matrix',category:'algebra',title:'اعداد در یک قاب',description:'ساختار ماتریس و معنی دترمینان.',view:'شبکهٔ ماتریس',preview:'matrix',demo:true,
   prompt:'دترمینان ماتریس [[1,2],[3,4]] را مرحله‌به‌مرحله حساب کن و خود ماتریس را به صورت بصری نشان بده.'},
  {id:'limit',category:'calculus',title:'نزدیک صفر چه می‌شود؟',description:'نزدیک شدن را ببین؛ حد را بفهم.',view:'نمودار حد',preview:'limit',
   prompt:'حد sin(x)/x وقتی x به صفر نزدیک می‌شود را ساده توضیح بده و رفتار تابع نزدیک صفر را روی نمودار نشان بده.'},
  {id:'equation',category:'algebra',title:'نقطهٔ تعادل',description:'جواب معادله را روی محور پیدا کن.',view:'ریشهٔ تابع',preview:'line',demo:true,
   prompt:'معادله 2*x + 3 = 7 را حل کن و با نمودار اختلاف دو طرف نشان بده چرا x=2 جواب است.'},
  {id:'growth',category:'functions',title:'رشد، هر بار سریع‌تر',description:'رشد خطی و نمایی چه تفاوتی دارند؟',view:'نمودار رشد',preview:'growth',
   prompt:'تابع f(x)=exp(a*x) را با کنترل ضریب a توضیح بده و نشان بده رشد نمایی چه تفاوتی با رشد خطی دارد.'},
  {id:'optimization',category:'calculus',title:'بهترین نقطه کجاست؟',description:'کمینه را از شکل سهمی پیدا کن.',view:'نمودار کمینه',preview:'minimum',
   prompt:'کمینه تابع f(x)=(x-2)^2+1 را پیدا کن و رابطه مشتق صفر و پایین‌ترین نقطه نمودار را ساده توضیح بده.'},
  {id:'logarithm',category:'functions',title:'برعکسِ رشد نمایی',description:'لگاریتم را روی یک نمودار بشناس.',view:'نمودار لگاریتم',preview:'log',
   prompt:'لگاریتم طبیعی چیست؟ تابع f(x)=log(x) را در بازه 0.1 تا 5 نشان بده و رابطه آن با تابع نمایی را ساده توضیح بده.'},
  {id:'vector',category:'algebra',title:'عددهایی با جهت',description:'طول و جهتِ یک بردار را جدا ببین.',view:'نمایش بردار',preview:'vector',
   prompt:'بردار v=(3,4) و طول آن را ساده توضیح بده؛ با یک نمایش بصری رابطه مؤلفه‌ها، جهت و طول را نشان بده.'},
  {id:'probability',category:'concepts',title:'دو روی یک احتمال',description:'فضای حالت‌ها را با پرتاب سکه ببین.',view:'درخت احتمال',preview:'tree',
   prompt:'احتمال پرتاب دو سکه سالم را با یک درخت یا نمودار حالت‌ها توضیح بده؛ احتمال اینکه هر دو شیر باشند چقدر است؟'},
  {id:'sequences',category:'concepts',title:'الگو را ادامه بده',description:'از چند عدد، یک قانون بساز.',view:'نقشهٔ الگو',preview:'sequence',
   prompt:'دنباله 2، 4، 8، 16 را ساده توضیح بده و با یک نمودار ارتباطی نشان بده هر جمله چگونه از جمله قبلی ساخته می‌شود.'},
  {id:'sets',category:'concepts',title:'وقتی دو مجموعه می‌رسند',description:'اشتراک و اجتماع را تصویری بفهم.',view:'ارتباط مجموعه‌ها',preview:'sets',
   prompt:'اشتراک و اجتماع دو مجموعه A={1,2,3} و B={3,4,5} را با یک نمایش بصری ساده توضیح بده.'}
];

export function selectIdeas(category='all', expanded=false){
  const chosen=ideaCatalog.filter(idea=>category==='all'||idea.category===category);
  return category==='all'&&!expanded?chosen.slice(0,8):chosen;
}
