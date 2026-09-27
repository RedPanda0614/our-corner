// Daily question: built-in bilingual bank, date-seeded daily pick, and scheduling for custom questions.
(() => {
  'use strict';
  const CATEGORIES = {
    fun: { en: 'FUN', zh: '好玩' },
    deep: { en: 'DEEP', zh: '走心' },
    memory: { en: 'MEMORY', zh: '回忆' },
    wyr: { en: 'WOULD YOU RATHER', zh: '二选一' },
    know: { en: 'GET TO KNOW', zh: '了解你' },
    future: { en: 'FUTURE', zh: '未来' },
    custom: { en: 'JUST FOR YOU', zh: '私房题' }
  };

  // Append-only. Never reorder, renumber, change the meaning of, or reuse an id:
  // answers keep a snapshot of the text, but ids must stay stable. New questions go at the end.
  const BANK = [
    { id: 'q001', cat: 'fun', en: "If we opened a tiny shop together, what would it sell and what would we name it?", zh: '如果我们一起开一家小店，你想卖什么？店名叫什么？' },
    { id: 'q002', cat: 'fun', en: "If our life were a sitcom, what would it be called and who would get the most laughs?", zh: '如果把我们的日常拍成情景喜剧，剧名叫什么？谁是笑点担当？' },
    { id: 'q003', cat: 'fun', en: "Which animal do you think I am, and which one are you?", zh: '你觉得我像哪种动物？你自己又像哪种？' },
    { id: 'q004', cat: 'fun', en: "If we swapped lives for a day, what's the first thing you'd do as me?", zh: '如果我们互换身份一天，你变成我之后第一件事做什么？' },
    { id: 'q005', cat: 'fun', en: "What food combination do you secretly love that most people would find weird?", zh: '有什么奇怪的食物搭配，是你偷偷喜欢、别人却接受不了的？' },
    { id: 'q006', cat: 'fun', en: "If a theme song played every time we walked into a room together, what would it be?", zh: '如果我们俩每次一起出场都自带BGM，你选哪首歌？' },
    { id: 'q007', cat: 'fun', en: "What's your most useless talent, and will you show me later?", zh: '你最没用的一项技能是什么？待会儿能表演给我看吗？' },
    { id: 'q008', cat: 'fun', en: "If you could make one silly rule for whenever we're together, what would it be?", zh: '如果能给我们俩定一条搞笑的相处规矩，你会定什么？' },
    { id: 'q009', cat: 'fun', en: "Which fictional couple do you think we're most like, and why?", zh: '你觉得我们最像哪对影视或小说里的情侣？为什么？' },
    { id: 'q010', cat: 'fun', en: "If you could have a superpower that's only mildly useful, which one would you pick?", zh: '如果只能拥有一种没什么大用的小超能力，你会选什么？' },
    { id: 'q011', cat: 'fun', en: "If you were an ice cream flavor, what would you be and what's the secret ingredient?", zh: '如果你是一种冰淇淋口味，你会是什么？秘密配方是什么？' },
    { id: 'q012', cat: 'fun', en: "If we got stuck in an elevator for three hours, how would we pass the time?", zh: '如果我们被困在电梯里三个小时，你打算怎么打发时间？' },
    { id: 'q013', cat: 'fun', en: "What's a phrase I say so often that you could do a perfect impression of it?", zh: '我有什么口头禅，是你已经能模仿得惟妙惟肖的？' },
    { id: 'q014', cat: 'fun', en: "If a documentary crew followed us for a week, which scene would go viral?", zh: '如果有纪录片团队跟拍我们一周，哪个片段最可能爆红？' },
    { id: 'q015', cat: 'fun', en: "If we were characters in a video game, what would our special skills be?", zh: '如果我们是游戏里的角色，你觉得我们各自的技能是什么？' },
    { id: 'q016', cat: 'fun', en: "Which emoji is most me, and which one is most you?", zh: '哪个表情最能代表我？哪个最能代表你自己？' },
    { id: 'q017', cat: 'fun', en: "If you had to nickname me after a food, what would you call me?", zh: '如果要用一种食物给我起外号，你会叫我什么？' },
    { id: 'q018', cat: 'fun', en: "If my phone could talk, what would it tell you about me?", zh: '如果我的手机会说话，它会跟你爆料我什么？' },
    { id: 'q019', cat: 'fun', en: "If you could teleport us anywhere for dinner tonight, where would we eat?", zh: '如果今晚能瞬移到任何地方吃晚饭，你想带我去哪儿？' },
    { id: 'q020', cat: 'fun', en: "What's a totally petty thing you'd happily debate with me just for fun?", zh: '有什么鸡毛蒜皮的小事，你愿意为了好玩跟我争到底？' },
    { id: 'q021', cat: 'fun', en: "If your mood today were a weather forecast, what would it say?", zh: '如果用天气预报来播报你今天的心情，会怎么说？' },
    { id: 'q022', cat: 'fun', en: "Which song should we sing together at karaoke, even if we'd sound terrible?", zh: '去KTV的话，哪首歌就算我们唱得再难听也要合唱？' },
    { id: 'q023', cat: 'fun', en: "If you woke up as a cartoon character tomorrow, who would you be?", zh: '如果明天一觉醒来变成卡通人物，你希望是谁？' },
    { id: 'q024', cat: 'fun', en: "What would our secret handshake look like?", zh: '如果我们有一套专属的暗号手势，你会怎么设计？' },
    { id: 'q025', cat: 'fun', en: "If I came with a settings menu, which setting would you adjust?", zh: '如果我有一个设置菜单，你最想调哪个选项？' },
    { id: 'q026', cat: 'fun', en: "If you could only speak in movie quotes for a day, which line would you use most?", zh: '如果一整天只能用电影台词说话，你最常用哪一句？' },
    { id: 'q027', cat: 'fun', en: "If I left the room, which of my snacks would you steal first?", zh: '如果我离开房间一会儿，我的零食里你会先偷吃哪样？' },
    { id: 'q028', cat: 'fun', en: "If we started a band, what would it be called and what would we sound like?", zh: '如果我们组一支乐队，叫什么名字？走什么风格？' },
    { id: 'q029', cat: 'fun', en: "If aliens asked you to explain us in one sentence, what would you say?", zh: '如果外星人让你用一句话介绍我们俩，你会怎么说？' },
    { id: 'q030', cat: 'fun', en: "If we swapped hobbies for a week, which of mine would give you the most trouble?", zh: '如果我们交换爱好一周，我的哪个爱好最让你头疼？' },

    { id: 'q031', cat: 'deep', en: "What's something I do that makes you feel looked after?", zh: '我做的哪件事最让你觉得被照顾？' },
    { id: 'q032', cat: 'deep', en: "When do you feel most like yourself around me?", zh: '和我在一起时，什么时候你觉得最自在、最像你自己？' },
    { id: 'q033', cat: 'deep', en: "What's something you've never quite said out loud to me, but want me to know?", zh: '有什么话你一直没说出口，但希望我知道？' },
    { id: 'q034', cat: 'deep', en: "Which of my qualities would you borrow for a day if you could?", zh: '如果能借用我身上的一个特质一天，你想借哪个？' },
    { id: 'q035', cat: 'deep', en: "What small thing did I do recently that meant more to you than I probably realized?", zh: '最近我做的哪件小事，其实对你意义很大，而我可能没意识到？' },
    { id: 'q036', cat: 'deep', en: "What are you proud of yourself for this year that you haven't bragged about yet?", zh: '今年有什么事让你为自己骄傲，却还没好好炫耀过？' },
    { id: 'q037', cat: 'deep', en: "In what way have I changed you for the better?", zh: '我让你在哪些方面变得更好了？' },
    { id: 'q038', cat: 'deep', en: "What's a belief you held strongly a few years ago that you've since changed your mind about?", zh: '有什么几年前你深信不疑的想法，现在已经改变了？' },
    { id: 'q039', cat: 'deep', en: "What makes you feel most loved by me: kind words, time together, a hug, little gifts, or help with something?", zh: '我怎么做最让你感受到爱？说好听的话、陪着你、抱抱你、送小礼物，还是帮你分担？' },
    { id: 'q040', cat: 'deep', en: "Is there a small worry about us that you'd feel lighter saying out loud?", zh: '关于我们，有没有什么小小的担心，说出来你会轻松一点？' },
    { id: 'q041', cat: 'deep', en: "What's something from your family that you'd like to carry into our life together?", zh: '你家里有什么好传统或好习惯，是你想带进我们的生活里的？' },
    { id: 'q042', cat: 'deep', en: "What do you value most in a friendship, and do you think we have it?", zh: '你最看重友情里的什么？你觉得我们之间有吗？' },
    { id: 'q043', cat: 'deep', en: "What's something I believe in that you admire, even if you don't fully share it?", zh: '我坚持的哪个信念，就算你不完全认同，也让你挺佩服？' },
    { id: 'q044', cat: 'deep', en: "When you're stressed, do you want me closer, or a little more space?", zh: '你压力大的时候，希望我靠近一点陪着你，还是给你留点空间？' },
    { id: 'q045', cat: 'deep', en: "Which part of you do you think I understand best, and which part least?", zh: '你觉得我最懂你的哪一面？最不懂的又是哪一面？' },
    { id: 'q046', cat: 'deep', en: "Beyond a place, what does “home” feel like to you?", zh: '除了一个地方，“家”对你来说是什么感觉？' },
    { id: 'q047', cat: 'deep', en: "What's something you wish you'd asked me for help with sooner?", zh: '有什么事你后悔没早点找我帮忙？' },
    { id: 'q048', cat: 'deep', en: "When do you feel proudest to be with me?", zh: '什么时候你会特别骄傲自己和我在一起？' },
    { id: 'q049', cat: 'deep', en: "What's something you're working on in yourself that I might not have noticed?", zh: '你最近在悄悄改进自己的哪一点，可能我还没发现？' },
    { id: 'q050', cat: 'deep', en: "What do you think we're really good at as a team?", zh: '你觉得我们俩搭档起来，最擅长什么？' },
    { id: 'q051', cat: 'deep', en: "What's something you'd like more of from me lately, and something you'd like less of?", zh: '最近你希望我多做点什么？少做点什么？' },
    { id: 'q052', cat: 'deep', en: "What does being brave look like in your everyday life?", zh: '在你的日常生活里，“勇敢”是什么样子的？' },
    { id: 'q053', cat: 'deep', en: "When did you feel most understood by me?", zh: '哪一刻你觉得自己被我真正读懂了？' },
    { id: 'q054', cat: 'deep', en: "On days when you're not at your best, what do you hope I remember about you?", zh: '在你状态不好的日子里，你希望我记得你的什么？' },
    { id: 'q055', cat: 'deep', en: "If you could thank your younger self for one thing, what would it be?", zh: '如果能对小时候的自己说声谢谢，你会谢什么？' },
    { id: 'q056', cat: 'deep', en: "What do you think I need to hear more often?", zh: '你觉得我需要更常听到哪句话？' },
    { id: 'q057', cat: 'deep', en: "What's one thing being with me has taught you about love?", zh: '和我在一起，让你对爱有了什么新的理解？' },
    { id: 'q058', cat: 'deep', en: "What was hard to share with me at first but feels easy now?", zh: '有什么事一开始很难对我开口，现在却能轻松说出来？' },
    { id: 'q059', cat: 'deep', en: "When you picture me at my happiest, what am I doing?", zh: '想象我最快乐的样子，我在做什么？' },
    { id: 'q060', cat: 'deep', en: "What's something we've gotten better at when we disagree?", zh: '我们意见不合的时候，有哪一点比以前做得更好了？' },

    { id: 'q061', cat: 'memory', en: "What did you first notice about me?", zh: '你第一次见到我时，最先注意到的是什么？' },
    { id: 'q062', cat: 'memory', en: "What's a small moment with me you still replay?", zh: '和我在一起的哪个小瞬间，你到现在还会反复回味？' },
    { id: 'q063', cat: 'memory', en: "When did you first realize you really liked me?", zh: '你是什么时候发现自己真的喜欢上我的？' },
    { id: 'q064', cat: 'memory', en: "What's your favorite photo of us, and what happened just before it was taken?", zh: '你最喜欢我们的哪张合照？拍之前发生了什么？' },
    { id: 'q065', cat: 'memory', en: "Which trip together would you relive tomorrow if you could?", zh: '我们一起去过的地方里，你最想明天就再去一次的是哪里？' },
    { id: 'q066', cat: 'memory', en: "What's an inside joke of ours that still makes you laugh?", zh: '我们之间的哪个梗，你现在想起来还会笑？' },
    { id: 'q067', cat: 'memory', en: "What's the best meal we've ever shared?", zh: '我们一起吃过最难忘的一顿饭是哪一顿？' },
    { id: 'q068', cat: 'memory', en: "What details do you still remember from our first date?", zh: '关于我们的第一次约会，你还记得哪些细节？' },
    { id: 'q069', cat: 'memory', en: "When did I surprise you in the best way?", zh: '我哪一次给你的惊喜让你印象最深？' },
    { id: 'q070', cat: 'memory', en: "When did we laugh so hard we couldn't stop?", zh: '有哪一次我们笑到停不下来？' },
    { id: 'q071', cat: 'memory', en: "Do you remember the first gift I gave you, and what did you think of it?", zh: '你还记得我送你的第一份礼物吗？当时你怎么想的？' },
    { id: 'q072', cat: 'memory', en: "Is there a place that reminds you of me every time you pass it?", zh: '有没有哪个地方，你每次经过都会想起我？' },
    { id: 'q073', cat: 'memory', en: "When did something go wrong for us that turned into one of our best stories?", zh: '有没有哪次我们出了岔子，结果反而成了我们最爱讲的故事？' },
    { id: 'q074', cat: 'memory', en: "What did I say early on that you still remember?", zh: '我们刚认识时，我说过的哪句话你到现在还记得？' },
    { id: 'q075', cat: 'memory', en: "Which lazy, do-nothing day with me do you look back on fondly?", zh: '有没有哪个和我一起无所事事的懒散日子，让你特别怀念？' },
    { id: 'q076', cat: 'memory', en: "When did you feel really proud of me?", zh: '有哪个时刻，你特别为我骄傲？' },
    { id: 'q077', cat: 'memory', en: "What was our funniest misunderstanding?", zh: '我们之间最好笑的一次误会是什么？' },
    { id: 'q078', cat: 'memory', en: "What's a compliment from me that stuck with you?", zh: '我夸过你的哪句话，你一直记在心里？' },
    { id: 'q079', cat: 'memory', en: "When did you first feel completely relaxed around me?", zh: '你第一次在我面前完全放松下来，是什么时候？' },
    { id: 'q080', cat: 'memory', en: "What's a message from me you still remember?", zh: '我发给你的哪条消息，让你印象特别深？' },
    { id: 'q081', cat: 'memory', en: "Which celebration of ours was your favorite, a birthday, a holiday, or just a random Tuesday?", zh: '我们一起庆祝过的日子里，你最喜欢哪一次？生日、节日，还是某个普通的周二？' },
    { id: 'q082', cat: 'memory', en: "When did I take care of you in a way you haven't forgotten?", zh: '有哪次我照顾你，让你到现在都忘不了？' },
    { id: 'q083', cat: 'memory', en: "Which moment from this past year with me would you put in a time capsule?", zh: '过去一年里和我在一起的哪个瞬间，你想放进时间胶囊？' },
    { id: 'q084', cat: 'memory', en: "What was something we tried for the first time together?", zh: '有什么事是我们一起第一次尝试的？' },
    { id: 'q085', cat: 'memory', en: "Before you really knew me, what did you think I was like?", zh: '在真正了解我之前，你以为我是个什么样的人？' },
    { id: 'q086', cat: 'memory', en: "When were we a great team under pressure?", zh: '有哪次我们在紧要关头配合得特别默契？' },
    { id: 'q087', cat: 'memory', en: "Which view that we saw together can you still picture clearly?", zh: '我们一起看过的哪片风景，你至今还能清楚地想起来？' },
    { id: 'q088', cat: 'memory', en: "Is there a smell, song, or taste that takes you straight back to a moment with me?", zh: '有什么气味、歌曲或味道，能一下子把你带回和我在一起的某个瞬间？' },
    { id: 'q089', cat: 'memory', en: "What's something you picked up from me that you now do without thinking?", zh: '有什么是你从我这里学来、现在已经变成习惯的？' },
    { id: 'q090', cat: 'memory', en: "What was our hardest goodbye, and what was our happiest hello?", zh: '我们最难舍的一次告别和最开心的一次重逢，分别是哪次？' },

    { id: 'q091', cat: 'wyr', en: "Would you rather have a picnic on a mountaintop or a slow breakfast in bed?", zh: '你更想在山顶野餐，还是赖在床上慢慢吃早餐？' },
    { id: 'q092', cat: 'wyr', en: "Would you rather take a road trip with no plan at all or one where every hour is planned?", zh: '你更想来一场毫无计划、说走就走的自驾游，还是每个小时都安排好的旅行？' },
    { id: 'q093', cat: 'wyr', en: "Would you rather be able to talk to animals or speak every human language?", zh: '你更想能和动物聊天，还是会说世界上所有语言？' },
    { id: 'q094', cat: 'wyr', en: "Would you rather relive our best day so far or skip ahead to see us in twenty years?", zh: '你更想重温我们到目前为止最好的一天，还是快进去看看二十年后的我们？' },
    { id: 'q095', cat: 'wyr', en: "Would you rather host a cooking show with me or a travel vlog with me?", zh: '你更想和我一起做美食节目，还是一起拍旅行vlog？' },
    { id: 'q096', cat: 'wyr', en: "Would you rather read my mind for a day or let me read yours?", zh: '你更想读一天我的心思，还是让我读一天你的心思？' },
    { id: 'q097', cat: 'wyr', en: "Would you rather never do laundry again or never wash dishes again?", zh: '你更想这辈子再也不用洗衣服，还是再也不用洗碗？' },
    { id: 'q098', cat: 'wyr', en: "Would you rather spend a week in a buzzing foreign city or a quiet countryside village?", zh: '你更想去热闹的外国大城市玩一周，还是在安静的乡村小镇住一周？' },
    { id: 'q099', cat: 'wyr', en: "Would you rather have a kitchen dance party or a quiet night reading side by side?", zh: '你更想在厨房里开一场跳舞派对，还是肩并肩安安静静看一晚上书？' },
    { id: 'q100', cat: 'wyr', en: "Would you rather eat only dumplings or only noodles for a month?", zh: '你更想连吃一个月饺子，还是连吃一个月面条？' },
    { id: 'q101', cat: 'wyr', en: "Would you rather go stargazing in the desert or chase the northern lights in the snow?", zh: '你更想去沙漠里看星星，还是去雪地里追极光？' },
    { id: 'q102', cat: 'wyr', en: "Would you rather be famous for your cooking or for your singing?", zh: '你更想因为厨艺出名，还是因为歌声出名？' },
    { id: 'q103', cat: 'wyr', en: "Would you rather eat breakfast for dinner forever or have dessert first at every meal?", zh: '你更想以后晚饭都吃早餐，还是每顿饭都先吃甜点？' },
    { id: 'q104', cat: 'wyr', en: "Would you rather have a dragon the size of a cat or a cat the size of a dragon?", zh: '你更想养一只猫那么大的龙，还是一只龙那么大的猫？' },
    { id: 'q105', cat: 'wyr', en: "Would you rather we write each other a letter every week or make each other a playlist every month?", zh: '你更想我们每周互写一封信，还是每个月给对方做一份歌单？' },
    { id: 'q106', cat: 'wyr', en: "Would you rather spend a rainy day in a blanket fort or a sunny day at the beach?", zh: '你更想下雨天和我窝在被子搭的小堡垒里，还是大晴天去海边玩？' },
    { id: 'q107', cat: 'wyr', en: "Would you rather have a clone who does your chores or a clone who goes to work for you?", zh: '你更想要一个帮你做家务的分身，还是一个替你上班的分身？' },
    { id: 'q108', cat: 'wyr', en: "Would you rather never need an alarm again or never get stuck in traffic again?", zh: '你更想从此不用定闹钟，还是从此再也不堵车？' },
    { id: 'q109', cat: 'wyr', en: "Would you rather learn to surf together or learn to ballroom dance together?", zh: '你更想和我一起学冲浪，还是一起学交谊舞？' },
    { id: 'q110', cat: 'wyr', en: "Would you rather have a secret language only we understand or a secret room only we know about?", zh: '你更想要一种只有我们懂的秘密语言，还是一个只有我们知道的秘密房间？' },
    { id: 'q111', cat: 'wyr', en: "Would you rather eat your way through a night market or sit down to a fancy tasting menu?", zh: '你更想逛夜市一路吃过去，还是坐下来吃一顿精致的主厨套餐？' },
    { id: 'q112', cat: 'wyr', en: "Would you rather live a whole year of winter or a whole year of summer?", zh: '你更想过一整年的冬天，还是一整年的夏天？' },
    { id: 'q113', cat: 'wyr', en: "Would you rather spend a month in a treehouse or a month on a houseboat?", zh: '你更想在树屋住一个月，还是在船屋住一个月？' },
    { id: 'q114', cat: 'wyr', en: "Would you rather have our story made into a movie or written into a song?", zh: '你更想把我们的故事拍成电影，还是写成一首歌？' },
    { id: 'q115', cat: 'wyr', en: "Would you rather be able to pause time or rewind it by five minutes?", zh: '你更想拥有暂停时间的能力，还是倒回五分钟的能力？' },
    { id: 'q116', cat: 'wyr', en: "Would you rather spend a day at an amusement park or a day at a museum?", zh: '你更想去游乐园玩一天，还是去博物馆逛一天？' },
    { id: 'q117', cat: 'wyr', en: "Would you rather wake up early to watch the sunrise or stay up late watching movies?", zh: '你更想早起一起看日出，还是熬夜一起看电影？' },
    { id: 'q118', cat: 'wyr', en: "Would you rather have a garden full of vegetables or a garden full of flowers?", zh: '你更想要一个种满蔬菜的园子，还是开满鲜花的园子？' },
    { id: 'q119', cat: 'wyr', en: "Would you rather fly but only a meter off the ground, or turn invisible but only when nobody is looking?", zh: '你更想会飞但只能离地一米，还是会隐身但只在没人看的时候生效？' },
    { id: 'q120', cat: 'wyr', en: "Would you rather own a robot that makes perfect bubble tea or one that gives perfect massages?", zh: '你更想要一个能做出完美奶茶的机器人，还是一个按摩手法完美的机器人？' },

    { id: 'q121', cat: 'know', en: "What's your go-to comfort food when you're feeling low?", zh: '心情低落的时候，你最想吃什么？' },
    { id: 'q122', cat: 'know', en: "What's been quietly worrying you lately?", zh: '最近有什么事在悄悄让你担心？' },
    { id: 'q123', cat: 'know', en: "Who was your best friend as a kid, and what did you two get up to?", zh: '你小时候最好的朋友是谁？你们常一起干什么？' },
    { id: 'q124', cat: 'know', en: "Which song gets you every single time?", zh: '哪首歌每次听都能戳中你？' },
    { id: 'q125', cat: 'know', en: "What recharges you best when you're running on empty?", zh: '累到没电的时候，什么最能帮你回血？' },
    { id: 'q126', cat: 'know', en: "What's the best advice you've ever been given, and who gave it to you?", zh: '你收到过最受用的建议是什么？是谁告诉你的？' },
    { id: 'q127', cat: 'know', en: "What food did you refuse to eat as a kid but love now?", zh: '有什么食物小时候死活不吃，现在却很喜欢？' },
    { id: 'q128', cat: 'know', en: "What's something you're looking forward to right now, big or small?", zh: '最近有没有什么让你期待的事，大事小事都算？' },
    { id: 'q129', cat: 'know', en: "What's a small daily ritual you'd be sad to lose?", zh: '有什么日常小习惯，要是没了你会很失落？' },
    { id: 'q130', cat: 'know', en: "Who in your life right now do you wish you got to see more often?", zh: '现在的生活里，你最希望能多见见谁？' },
    { id: 'q131', cat: 'know', en: "Which book, show, or film changed the way you see the world?", zh: '有哪本书、哪部剧或哪部电影，改变了你看世界的方式？' },
    { id: 'q132', cat: 'know', en: "What were you like at fifteen?", zh: '十五岁的你是什么样的？' },
    { id: 'q133', cat: 'know', en: "What's something you've always been curious about but never really looked into?", zh: '有什么东西你一直很好奇，却从没认真去了解过？' },
    { id: 'q134', cat: 'know', en: "What small pet peeve of yours might I not know about yet?", zh: '你有什么小小的雷点，可能我还不知道？' },
    { id: 'q135', cat: 'know', en: "What was your favorite subject in school, and why?", zh: '上学时你最喜欢哪门课？为什么？' },
    { id: 'q136', cat: 'know', en: "Which place from your childhood would you most like to show me?", zh: '你童年待过的哪个地方，最想带我去看看？' },
    { id: 'q137', cat: 'know', en: "What did you want to be when you grew up, back when you were little?", zh: '小时候你梦想长大后做什么？' },
    { id: 'q138', cat: 'know', en: "Which friend can you be completely silly around?", zh: '在哪个朋友面前，你可以完全放飞自我？' },
    { id: 'q139', cat: 'know', en: "What time of day do you like best, and why?", zh: '一天里你最喜欢哪个时段？为什么？' },
    { id: 'q140', cat: 'know', en: "How do you most like to spend your birthday?", zh: '你最喜欢怎么过生日？' },
    { id: 'q141', cat: 'know', en: "What's a goal you're working on this month?", zh: '这个月你在努力完成的一个小目标是什么？' },
    { id: 'q142', cat: 'know', en: "Is there a word or phrase from your hometown dialect or your family that you love?", zh: '你家乡话或者家里人常说的话里，有没有哪个词你特别喜欢？' },
    { id: 'q143', cat: 'know', en: "What's an old hobby you'd like to pick back up?", zh: '有什么以前的爱好，你想重新捡起来？' },
    { id: 'q144', cat: 'know', en: "What's a small treat that makes an ordinary day better for you?", zh: '有什么小小的享受，能让平凡的一天变得好一点？' },
    { id: 'q145', cat: 'know', en: "What's the first thing you do when you get home after a long day?", zh: '忙了一整天回到家，你第一件事做什么？' },
    { id: 'q146', cat: 'know', en: "Exactly how do you like your coffee or tea, down to the last detail?", zh: '你喝咖啡或茶有什么讲究，能具体说说吗？' },
    { id: 'q147', cat: 'know', en: "What's something about your work or studies you wish more people understood?", zh: '关于你的工作或学业，有什么是你希望别人能多理解一点的？' },
    { id: 'q148', cat: 'know', en: "What's a small win from this week that we should celebrate?", zh: '这周你有什么小成就，值得我们一起庆祝一下？' },
    { id: 'q149', cat: 'know', en: "Which teacher or grown-up had a big influence on you when you were young?", zh: '成长过程中，哪位老师或长辈对你影响很大？' },
    { id: 'q150', cat: 'know', en: "What made you smile today, even for a second?", zh: '今天有什么让你笑了一下，哪怕只有一秒？' },

    { id: 'q151', cat: 'future', en: "When you picture our home in ten years, what's one small detail you can see?", zh: '想象一下十年后我们的家，你脑海里浮现的一个小细节是什么？' },
    { id: 'q152', cat: 'future', en: "What's one place you want us to see together before we're old?", zh: '在我们变老之前，你最想和我一起去哪里看看？' },
    { id: 'q153', cat: 'future', en: "What's a little goal you'd like us to try together this year?", zh: '今年你想和我一起完成的一个小目标是什么？' },
    { id: 'q154', cat: 'future', en: "What's a new tradition you'd love for us to start?", zh: '你想和我一起开始一个什么新传统？' },
    { id: 'q155', cat: 'future', en: "What does a slow, happy Sunday look like for us when we're eighty?", zh: '你想象中，八十岁时我们一个悠闲快乐的周日是什么样的？' },
    { id: 'q156', cat: 'future', en: "If you could sign us both up for one class, what would it be?", zh: '如果能给我们俩报一门课，你会报什么？' },
    { id: 'q157', cat: 'future', en: "What's one thing you hope never changes about us?", zh: '关于我们，有什么是你希望永远不变的？' },
    { id: 'q158', cat: 'future', en: "What kind of old people do you think we'll turn into?", zh: '你觉得我们老了以后，会是一对什么样的老人？' },
    { id: 'q159', cat: 'future', en: "What's something you want to get better at over the next year?", zh: '接下来一年，你想在哪方面让自己变得更好？' },
    { id: 'q160', cat: 'future', en: "Which city would you want to try living in with me for a few months?", zh: '你想和我去哪座城市住上几个月试试？' },
    { id: 'q161', cat: 'future', en: "Where would you love to take a trip with me purely for the food?", zh: '你最想和我专门为了吃，去哪里旅行一趟？' },
    { id: 'q162', cat: 'future', en: "What's something we keep putting off that we should finally do next month?", zh: '有什么事我们一直在拖，下个月该去做了？' },
    { id: 'q163', cat: 'future', en: "What's a date idea you've been saving up for us?", zh: '你有没有一直偷偷攒着、想和我去的约会点子？' },
    { id: 'q164', cat: 'future', en: "How do you want us to celebrate our next anniversary?", zh: '你想怎么过我们的下一个纪念日？' },
    { id: 'q165', cat: 'future', en: "A year from now, what does your ideal weekday evening with me look like?", zh: '一年后，你理想中我们工作日的晚上是怎么过的？' },
    { id: 'q166', cat: 'future', en: "If we wrote a bucket list together, what would you put at the top?", zh: '如果我们一起写一份愿望清单，你会把什么写在第一条？' },
    { id: 'q167', cat: 'future', en: "What's something you'd love to make with your own hands someday?", zh: '以后你想亲手做出一样什么东西？' },
    { id: 'q168', cat: 'future', en: "What's a dream you've been quietly holding that I could help with?", zh: '你有没有什么悄悄藏着的梦想，是我可以帮上忙的？' },
    { id: 'q169', cat: 'future', en: "However busy life gets, what's one small thing we should never skip?", zh: '以后就算生活再忙，你觉得有哪件小事我们一定不能省？' },
    { id: 'q170', cat: 'future', en: "Which concert, festival, or event would you love for us to go to together?", zh: '你最想和我一起去看哪场演出、音乐节或活动？' },
    { id: 'q171', cat: 'future', en: "In ten years, which friends do you hope are still around us, and what are we all doing?", zh: '十年后，你希望我们身边还有哪些朋友？大家会一起做什么？' },
    { id: 'q172', cat: 'future', en: "Which dish would you like us to learn to make from scratch?", zh: '你想和我一起从零学会做哪道菜？' },
    { id: 'q173', cat: 'future', en: "If we suddenly had a whole free year, how would you want to spend it?", zh: '如果我们突然多出一整年自由时间，你想怎么过？' },
    { id: 'q174', cat: 'future', en: "What's a small change to our everyday life you'd like to try?", zh: '有什么能让我们的日常变得更好的小改变，你想试试？' },
    { id: 'q175', cat: 'future', en: "What's something you'd like us to be a little braver about?", zh: '你希望我们在哪件事上更勇敢一点？' },
    { id: 'q176', cat: 'future', en: "What do you hope we're still laughing about when we're old?", zh: '你希望我们老了以后，还会为什么事一起笑？' },
    { id: 'q177', cat: 'future', en: "If you could leave a note for us to open a year from now, what would it say?", zh: '如果能给一年后的我们留一张字条，你会写什么？' },
    { id: 'q178', cat: 'future', en: "If we had a motto just for us, what would you want it to be?", zh: '如果我们有一句专属座右铭，你希望是什么？' },
    { id: 'q179', cat: 'future', en: "What would you like us to grow together someday, a plant, a pet, or a little project?", zh: '以后你想和我一起养点什么？植物、宠物，还是一个小项目？' },
    { id: 'q180', cat: 'future', en: "What's a milestone ahead of us, big or small, that you're excited about?", zh: '我们接下来的哪个里程碑，不管大小，是你特别期待的？' }
  ];

  // ---------- dates (UTC, 'YYYY-MM-DD') ----------
  const DAY = 864e5, EPOCH = Date.UTC(2026, 0, 1);
  const toIso = t => new Date(t).toISOString().slice(0, 10);
  function parse(iso) { // ms at UTC midnight for a real calendar date, else null
    const m = typeof iso === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const t = Date.UTC(+m[1], m[2] - 1, +m[3]);
    return toIso(t) === iso ? t : null;
  }
  const nextDay = iso => toIso(parse(iso) + DAY);

  // ---------- bank: each cycle of BANK.length days is a seeded shuffle, so nothing repeats within a cycle ----------
  function mulberry32(a) {
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(cycle, L) {
    const rand = mulberry32((cycle + 1) >>> 0), order = Array.from({ length: L }, (_, i) => i);
    for (let i = L - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  // A new cycle opens with GAP questions that were not in the last GAP days of the previous one, so nothing
  // comes back within GAP days across a boundary. The tail of each order stays as shuffled (GAP <= L / 3).
  const orders = new Map();
  function orderFor(cycle, L) {
    const key = cycle + ':' + L;
    if (!orders.has(key)) {
      const raw = shuffled(cycle, L), gap = Math.min(30, Math.floor(L / 3));
      const recent = new Set(shuffled(cycle - 1, L).slice(L - gap)), head = [];
      for (const i of raw) { if (head.length === gap) break; if (!recent.has(i)) head.push(i); }
      const lead = new Set(head);
      orders.set(key, [...head, ...raw.filter(i => !lead.has(i))]);
    }
    return orders.get(key);
  }
  function bankFor(iso) {
    const t = parse(iso);
    if (t === null) return null;
    const n = Math.round((t - EPOCH) / DAY), L = BANK.length;
    const b = BANK[orderFor(Math.floor(n / L), L)[((n % L) + L) % L]];
    return { qid: b.id, cat: b.cat, en: b.en, zh: b.zh };
  }

  // ---------- custom questions: booked on a date; a clash moves the later one to the next free day ----------
  let memo = { list: null, items: [], out: [] }; // the store swaps item objects on change, so same refs mean same result
  function schedule(custom = []) {
    const list = Array.isArray(custom) ? custom : [];
    if (list === memo.list && list.length === memo.items.length && list.every((x, i) => x === memo.items[i])) return memo.out;
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const valid = list.filter(q => q && typeof q === 'object' && q.id != null && q.id !== '' && parse(q.date) !== null && String(q.text ?? '').trim())
      .sort((a, b) => cmp(a.date, b.date) || cmp(a.createdAt || 0, b.createdAt || 0) || cmp(String(a.id), String(b.id)));
    let last = null;
    const out = valid.map(q => { const on = last && q.date <= last ? nextDay(last) : q.date; last = on; return { q, on }; });
    memo = { list, items: list.slice(), out };
    return out;
  }
  function forDay(iso, custom = []) {
    if (parse(iso) === null) return null;
    const hit = schedule(custom).find(s => s.on === iso);
    return hit ? { qid: 'c:' + hit.q.id, cat: 'custom', text: String(hit.q.text).trim(), by: hit.q.by || '' } : bankFor(iso);
  }
  function nextFreeDay(fromIso, custom = []) {
    if (parse(fromIso) === null) return null;
    const taken = new Set(schedule(custom).map(s => s.on));
    let day = fromIso;
    while (taken.has(day)) day = nextDay(day);
    return day;
  }

  const api = { CATEGORIES, BANK, bankFor, schedule, forDay, nextFreeDay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCQuestions = api;
})();
