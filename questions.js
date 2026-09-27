// Daily question: built-in bilingual bank, date-seeded daily pick, scheduling for custom questions, and the weekly check-in.
(() => {
  'use strict';
  const CATEGORIES = {
    fun: { en: 'FUN', zh: '好玩' },
    deep: { en: 'DEEP', zh: '走心' },
    memory: { en: 'MEMORY', zh: '回忆' },
    wyr: { en: 'WOULD YOU RATHER', zh: '二选一' },
    know: { en: 'GET TO KNOW', zh: '了解你' },
    future: { en: 'FUTURE', zh: '未来' },
    week: { en: 'THIS WEEK', zh: '这周' },
    childhood: { en: 'CHILDHOOD', zh: '小时候' },
    food: { en: 'FOOD', zh: '吃货' },
    checkin: { en: 'WEEKLY CHECK-IN', zh: '每周心情' }, // the weekly question (WEEKLY), never in BANK
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
    { id: 'q180', cat: 'future', en: "What's a milestone ahead of us, big or small, that you're excited about?", zh: '我们接下来的哪个里程碑，不管大小，是你特别期待的？' },

    { id: 'q181', cat: 'fun', en: "If we had a mascot, what would it be and what would it wear?", zh: '如果我们俩有个吉祥物，它会是什么？穿什么衣服？' },
    { id: 'q182', cat: 'fun', en: "If there were a tiny museum all about us, what would the first exhibit be?", zh: '如果有一座专门讲我们俩的小博物馆，第一件展品会是什么？' },
    { id: 'q183', cat: 'fun', en: "If you came with a warning label, what would it say?", zh: '如果你身上贴着一张警告标签，上面会写什么？' },
    { id: 'q184', cat: 'fun', en: "If you hosted a late-night talk show, who would your first three guests be?", zh: '如果你主持一档深夜脱口秀，前三位嘉宾想请谁？' },
    { id: 'q185', cat: 'fun', en: "If our home could leave us a review, how many stars would it give us and why?", zh: '如果我们的家能给我们俩写条评价，会打几颗星？为什么？' },
    { id: 'q186', cat: 'fun', en: "If you could add one holiday to the calendar, what would it celebrate and how?", zh: '如果能在日历上新加一个节日，你想让它庆祝什么？怎么过？' },
    { id: 'q187', cat: 'fun', en: "If we entered a talent show as a duo, what would our act be?", zh: '如果我们俩组队参加才艺大赛，会表演什么节目？' },
    { id: 'q188', cat: 'fun', en: "What harmless conspiracy theory would you make up about me?", zh: '如果要编一个关于我的无害阴谋论，你会怎么编？' },
    { id: 'q189', cat: 'fun', en: "If you could be world champion of one very silly sport, which would it be?", zh: '如果能在一项特别无厘头的运动上拿世界冠军，你选哪一项？' },
    { id: 'q190', cat: 'fun', en: "If you were a friendly ghost, how would you haunt a house?", zh: '如果你是一只友善的小幽灵，你会怎么在房子里捣乱？' },
    { id: 'q191', cat: 'fun', en: "If you had a whole shopping mall to yourself for one night, what would you do first?", zh: '如果整座商场一整晚都归你一个人，你第一件事做什么？' },
    { id: 'q192', cat: 'fun', en: "What's a word that should exist but doesn't, and what would it mean?", zh: '有什么词你觉得早就该有，却一直没人发明？它是什么意思？' },
    { id: 'q193', cat: 'fun', en: "If you shrank to the size of a mouse for an afternoon, where would you explore?", zh: '如果你变得像老鼠一样小，过一个下午，你想去哪儿探险？' },
    { id: 'q194', cat: 'fun', en: "If we were a pair of cartoon villains, what would our evil plan be?", zh: '如果我们是动画片里的一对反派搭档，我们的邪恶计划是什么？' },
    { id: 'q195', cat: 'fun', en: "If you had to sell one of my habits in a TV shopping ad, how would you pitch it?", zh: '如果要在电视购物广告里推销我的一个小习惯，你会怎么吆喝？' },

    { id: 'q196', cat: 'deep', en: "What's a compliment you find hard to accept, and why do you think that is?", zh: '有什么夸奖是你很难坦然接受的？你觉得是为什么？' },
    { id: 'q197', cat: 'deep', en: "When did you last feel completely at peace, and what was around you?", zh: '你上一次觉得内心特别平静是什么时候？当时身边有什么？' },
    { id: 'q198', cat: 'deep', en: "What's a mistake you made that ended up teaching you something good?", zh: '有没有哪次犯的错，最后反而让你学到了好东西？' },
    { id: 'q199', cat: 'deep', en: "What do people tend to get wrong about you when they first meet you?", zh: '别人刚认识你的时候，常会对你有什么误会？' },
    { id: 'q200', cat: 'deep', en: "What's something about yourself you used to dislike but have made peace with?", zh: '关于你自己，有什么是你以前不喜欢、现在已经释然了的？' },
    { id: 'q201', cat: 'deep', en: "What does a good apology look like to you?", zh: '在你看来，一个好的道歉应该是什么样的？' },
    { id: 'q202', cat: 'deep', en: "When you're upset, which words actually comfort you, and which ones don't help?", zh: '你难过的时候，哪些话真的能安慰到你？哪些话其实没用？' },
    { id: 'q203', cat: 'deep', en: "Which part of your everyday life feels most meaningful to you right now?", zh: '眼下的日常生活里，哪一部分让你觉得最有意义？' },
    { id: 'q204', cat: 'deep', en: "In what moments do you feel most confident?", zh: '你在什么时候最有自信？' },
    { id: 'q205', cat: 'deep', en: "In a relationship, what comes easily for you to give, and what feels harder?", zh: '在感情里，什么是你很容易付出的？什么对你来说比较难？' },
    { id: 'q206', cat: 'deep', en: "Is there something you've wanted to try for a while but feel a little shy about?", zh: '有没有什么事你想试很久了，但又有点不好意思？' },
    { id: 'q207', cat: 'deep', en: "What's a feeling you find hard to put into words?", zh: '有什么感受，是你很难用语言说清楚的？' },
    { id: 'q208', cat: 'deep', en: "When we're apart for a whole day, what do you miss about me first?", zh: '我们分开一整天的时候，你最先想念我的什么？' },
    { id: 'q209', cat: 'deep', en: "What's a question you wish I asked you more often?", zh: '有什么问题，你希望我多问问你？' },
    { id: 'q210', cat: 'deep', en: "Which of your own little habits do you secretly like about yourself?", zh: '你自己的哪个小习惯，是你偷偷挺喜欢的？' },

    { id: 'q211', cat: 'memory', en: "Is there a rainy or snowy day with me that you still remember?", zh: '有没有哪个和我一起度过的雨天或雪天，让你记到现在？' },
    { id: 'q212', cat: 'memory', en: "Which of our silly disagreements makes you laugh now?", zh: '我们闹过的小别扭里，哪一次现在想起来会让你笑？' },
    { id: 'q213', cat: 'memory', en: "Which late-night conversation with me has stayed with you?", zh: '我们哪一次深夜聊天，让你一直记在心里？' },
    { id: 'q214', cat: 'memory', en: "When did I help you feel a little braver?", zh: '有哪一次，是我让你变得勇敢了一点？' },
    { id: 'q215', cat: 'memory', en: "Which place we visited didn't live up to the hype, but was fun anyway?", zh: '我们去过的哪个地方名不副实，但还是玩得很开心？' },
    { id: 'q216', cat: 'memory', en: "What do you remember about meeting my friends or family for the first time?", zh: '第一次见我的朋友或家人时，你还记得哪些细节？' },
    { id: 'q217', cat: 'memory', en: "When did we get properly lost together, and how did we find our way back?", zh: '我们有没有哪次一起彻底迷了路？后来是怎么找到路的？' },
    { id: 'q218', cat: 'memory', en: "When did you realize I'd remembered something you said in passing?", zh: '什么时候你发现，我把你随口说的一句话记在了心上？' },
    { id: 'q219', cat: 'memory', en: "Which season with me do you remember most fondly, and why?", zh: '和我一起度过的哪个季节，让你最怀念？为什么？' },
    { id: 'q220', cat: 'memory', en: "When did I cheer you up without even knowing you were down?", zh: '有没有哪次你心情不好，我还没察觉，却刚好把你逗开心了？' },
    { id: 'q221', cat: 'memory', en: "Do you remember the first nickname we gave each other, and where it came from?", zh: '你还记得我们给对方起的第一个昵称吗？它是怎么来的？' },
    { id: 'q222', cat: 'memory', en: "What's a small promise I kept that you noticed?", zh: '我遵守过的哪个小承诺，被你默默记住了？' },
    { id: 'q223', cat: 'memory', en: "What's something from our early days together that you miss a little?", zh: '我们刚在一起那段时间，有什么是你现在还有点怀念的？' },
    { id: 'q224', cat: 'memory', en: "When did you first see me really nervous, and what was it about?", zh: '你第一次看到我特别紧张是什么时候？是因为什么事？' },
    { id: 'q225', cat: 'memory', en: "Which walk we took together do you remember best?", zh: '我们一起散过的步里，你记得最清楚的是哪一次？' },

    { id: 'q226', cat: 'wyr', en: "Would you rather spend a whole day without your phone or a whole day without talking?", zh: '你更想过一整天不碰手机，还是一整天不说话？' },
    { id: 'q227', cat: 'wyr', en: "Would you rather have a personal chef or a personal driver?", zh: '你更想要一位私人厨师，还是一位私人司机？' },
    { id: 'q228', cat: 'wyr', en: "Would you rather always know what I'm craving or always know which song is stuck in my head?", zh: '你更想永远知道我此刻想吃什么，还是永远知道我脑子里在循环哪首歌？' },
    { id: 'q229', cat: 'wyr', en: "Would you rather live above a bakery or next door to a bookshop?", zh: '你更想住在面包店楼上，还是书店隔壁？' },
    { id: 'q230', cat: 'wyr', en: "Would you rather take a slow train across a country or a short flight to a tiny island?", zh: '你更想坐慢火车穿越一整个国家，还是飞一小段去一座小岛？' },
    { id: 'q231', cat: 'wyr', en: "Would you rather be unbeatable at board games or never lose at rock paper scissors?", zh: '你更想玩桌游所向无敌，还是剪刀石头布永远不输？' },
    { id: 'q232', cat: 'wyr', en: "Would you rather have a perfect sense of direction or never forget a name?", zh: '你更想拥有完美的方向感，还是永远不会忘记别人的名字？' },
    { id: 'q233', cat: 'wyr', en: "Would you rather go camping in a tent for the weekend or stay in a fancy hotel with room service?", zh: '你更想周末去搭帐篷露营，还是住豪华酒店叫客房服务？' },
    { id: 'q234', cat: 'wyr', en: "Would you rather be able to fix anything that breaks or grow any plant you touch?", zh: '你更想什么东西坏了都会修，还是什么植物都能养活？' },
    { id: 'q235', cat: 'wyr', en: "Would you rather plan a surprise for me or be surprised by me?", zh: '你更想给我准备惊喜，还是等着被我惊喜？' },
    { id: 'q236', cat: 'wyr', en: "Would you rather be a character in a fairy tale or in a detective story?", zh: '你更想当童话故事里的角色，还是侦探小说里的角色？' },
    { id: 'q237', cat: 'wyr', en: "Would you rather spend a day as a cat in our home or as a bird above the city?", zh: '你更想变成一只猫在我们家待一天，还是变成一只鸟在城市上空飞一天？' },
    { id: 'q238', cat: 'wyr', en: "Would you rather have to sing everything you say or dance everywhere you walk?", zh: '你更想说的每句话都得唱出来，还是走的每一步都得跳着舞？' },
    { id: 'q239', cat: 'wyr', en: "Would you rather spend a year of weekends on surprise trips or a year of weekends cozy at home?", zh: '你更想接下来一年的周末都去惊喜旅行，还是一年的周末都在家舒舒服服地窝着？' },
    { id: 'q240', cat: 'wyr', en: "Would you rather get a hundred small gifts or one gift you'll keep forever?", zh: '你更想收到一百份小礼物，还是一份能珍藏一辈子的礼物？' },

    { id: 'q241', cat: 'know', en: "What's a smell that instantly makes you feel calm?", zh: '有什么气味，一闻到就能让你平静下来？' },
    { id: 'q242', cat: 'know', en: "Besides me, who's the first person you want to tell when something good happens?", zh: '有好消息的时候，除了我，你第一个想告诉谁？' },
    { id: 'q243', cat: 'know', en: "What's a skill you're quietly proud of that most people don't know you have?", zh: '你有什么不太为人知、自己却偷偷挺得意的本事？' },
    { id: 'q244', cat: 'know', en: "What's your ideal way to spend a rainy afternoon on your own?", zh: '一个人的下雨天午后，你最理想的打发方式是什么？' },
    { id: 'q245', cat: 'know', en: "What's a topic you could talk about for an hour without any notes?", zh: '有什么话题，你不用准备就能滔滔不绝讲上一小时？' },
    { id: 'q246', cat: 'know', en: "Which app on your phone would be hardest for you to delete?", zh: '你手机里哪个应用最舍不得删？' },
    { id: 'q247', cat: 'know', en: "What's a small thing that always makes you nervous, even though you know it's no big deal?", zh: '有什么小事明明不算什么，却总让你紧张？' },
    { id: 'q248', cat: 'know', en: "Who's someone you admire but have never met?", zh: '有没有哪个你从没见过、却很欣赏的人？' },
    { id: 'q249', cat: 'know', en: "What do you usually do when you can't fall asleep?", zh: '睡不着的时候，你一般会做什么？' },
    { id: 'q250', cat: 'know', en: "Where's your favorite place nearby to be alone for a while?", zh: '在你住的地方附近，你最喜欢一个人待着的去处是哪儿？' },
    { id: 'q251', cat: 'know', en: "What's a movie or show you could rewatch endlessly?", zh: '有什么电影或剧，你怎么看都看不腻？' },
    { id: 'q252', cat: 'know', en: "What's a rule you always follow, even when nobody's watching?", zh: '有什么规矩，就算没人看着你也一定会遵守？' },
    { id: 'q253', cat: 'know', en: "Which chore do you secretly not mind doing?", zh: '有什么家务，你其实偷偷不讨厌做？' },
    { id: 'q254', cat: 'know', en: "Is there anything you collect now, or used to collect?", zh: '你现在有没有在收集什么东西？或者以前收集过？' },
    { id: 'q255', cat: 'know', en: "When you're sick, how do you like to be looked after?", zh: '你生病的时候，希望别人怎么照顾你？' },

    { id: 'q256', cat: 'future', en: "What's an ordinary errand you'd like us to turn into a little date?", zh: '有什么普通的日常琐事，你想把它变成我们的小约会？' },
    { id: 'q257', cat: 'future', en: "What would a perfect staycation weekend look like for us, without leaving town?", zh: '如果我们不出城，来一次本地度假，你理想中的周末怎么安排？' },
    { id: 'q258', cat: 'future', en: "Which season coming up are you most looking forward to spending with me, and why?", zh: '接下来的哪个季节，你最期待和我一起过？为什么？' },
    { id: 'q259', cat: 'future', en: "What's a question you'd like to ask me again in ten years, to see if my answer changed?", zh: '有什么问题，你想十年后再问我一次，看看我的答案变没变？' },
    { id: 'q260', cat: 'future', en: "What's something you'd like to teach me someday?", zh: '有什么东西，你以后想亲自教会我？' },
    { id: 'q261', cat: 'future', en: "What's something you want to say yes to more often in the coming year?", zh: '接下来这一年，你想对什么事多说几次“好”？' },
    { id: 'q262', cat: 'future', en: "A few years from now, what do you hope our friends say about us?", zh: '几年以后，你希望朋友们提起我们时会怎么说？' },
    { id: 'q263', cat: 'future', en: "If our home had a little corner that was just yours, what would you put there?", zh: '如果我们家里有一个只属于你的小角落，你想在那儿放些什么？' },
    { id: 'q264', cat: 'future', en: "If we made a scrapbook of next year, what do you hope is on the first page?", zh: '如果给明年的我们做一本手账，你希望第一页贴着什么？' },
    { id: 'q265', cat: 'future', en: "What kind of neighborhood do you picture us living in someday?", zh: '你想象中，我们以后会住在一个什么样的街区？' },
    { id: 'q266', cat: 'future', en: "When things get hard someday, what do you hope we're like as a team?", zh: '以后遇到难关的时候，你希望我们俩是什么样的搭档？' },
    { id: 'q267', cat: 'future', en: "What's a first time you'd like us to share next year?", zh: '明年你想和我一起解锁哪个“第一次”？' },
    { id: 'q268', cat: 'future', en: "A year from now, what do you hope you're spending more time on than you are today?", zh: '一年以后，你希望自己在什么事上花的时间比现在多？' },
    { id: 'q269', cat: 'future', en: "Which goal of mine would you most love to celebrate with me when it happens?", zh: '我的哪个目标实现的时候，你最想陪我一起庆祝？' },
    { id: 'q270', cat: 'future', en: "Five years from now, what do you want our weekends to feel like?", zh: '五年后，你希望我们的周末是什么感觉？' },

    { id: 'q271', cat: 'week', en: "Which moment this week do you wish I'd been there to see?", zh: '这周有哪个瞬间，你真希望我当时也在场？' },
    { id: 'q272', cat: 'week', en: "What's the best thing you ate this week?", zh: '这周你吃到最好吃的一样东西是什么？' },
    { id: 'q273', cat: 'week', en: "What song did you have on repeat this week?", zh: '这周你单曲循环的是哪首歌？' },
    { id: 'q274', cat: 'week', en: "Besides me, who made you laugh this week?", zh: '这周除了我，还有谁把你逗笑了？' },
    { id: 'q275', cat: 'week', en: "What made you say “finally!” this week?", zh: '这周有什么事让你忍不住感叹了一句“终于”？' },
    { id: 'q276', cat: 'week', en: "What's the funniest thing you saw online this week?", zh: '这周你在网上看到最好笑的东西是什么？' },
    { id: 'q277', cat: 'week', en: "What went better than you expected this week?", zh: '这周有什么事，结果比你预想的要好？' },
    { id: 'q278', cat: 'week', en: "What small thing annoyed you this week that we can laugh about now?", zh: '这周有什么小事让你有点烦，现在可以拿来一起笑笑？' },
    { id: 'q279', cat: 'week', en: "If this week were a movie, what would the title be?", zh: '如果把你这周拍成一部电影，片名叫什么？' },
    { id: 'q280', cat: 'week', en: "What's something new you learned this week, however random?", zh: '这周你学到了什么新鲜知识，哪怕很冷门？' },
    { id: 'q281', cat: 'week', en: "What did you spend way too long thinking about this week that didn't matter at all?", zh: '这周你琢磨了半天、其实一点都不重要的事是什么？' },
    { id: 'q282', cat: 'week', en: "Which conversation from this week has stuck with you?", zh: '这周有哪段对话，让你一直记着？' },
    { id: 'q283', cat: 'week', en: "What was the coziest moment of your week?", zh: '这周你最惬意的一个瞬间是什么？' },
    { id: 'q284', cat: 'week', en: "If this weekend had no plans at all, what would you do first?", zh: '如果这个周末什么安排都没有，你第一件想做的事是什么？' },
    { id: 'q285', cat: 'week', en: "What did you notice on your way somewhere this week that made you stop and look?", zh: '这周在路上，有什么让你停下来多看了一眼？' },
    { id: 'q286', cat: 'week', en: "Who are you grateful for this week, and why?", zh: '这周你最想感谢谁？为什么？' },
    { id: 'q287', cat: 'week', en: "What small kindness did you see or receive this week?", zh: '这周你看到或收到过什么小小的善意？' },
    { id: 'q288', cat: 'week', en: "What did you do this week purely because you wanted to?", zh: '这周你做了什么事，纯粹只是因为自己想做？' },
    { id: 'q289', cat: 'week', en: "What's the most random thing that happened to you this week?", zh: '这周发生在你身上最莫名其妙的事是什么？' },
    { id: 'q290', cat: 'week', en: "On a scale of one to ten dumplings, how was your week?", zh: '如果满分是十个饺子，你给这周打几个？' },
    { id: 'q291', cat: 'week', en: "Which photo on your phone from this week has a story behind it?", zh: '你这周拍的照片里，哪张背后有故事？' },
    { id: 'q292', cat: 'week', en: "What's one thing you'd like us to do together before this week is over?", zh: '这周结束前，你最想和我一起做的一件事是什么？' },
    { id: 'q293', cat: 'week', en: "Which day this week felt the longest, and which one flew by?", zh: '这周你觉得哪天过得最慢？哪天一眨眼就过去了？' },
    { id: 'q294', cat: 'week', en: "What's a story from this week you haven't had a chance to tell me yet?", zh: '这周有什么事，你还没来得及讲给我听？' },
    { id: 'q295', cat: 'week', en: "If you handed out awards for this week, like best snack or weirdest moment, who or what would win?", zh: '如果给这周颁几个奖，比如最佳零食、最离谱瞬间，你会颁给谁？' },
    { id: 'q296', cat: 'week', en: "What was your smartest decision this week, even a tiny one?", zh: '这周你做过最明智的一个决定是什么，哪怕很小？' },
    { id: 'q297', cat: 'week', en: "What did you put off this week, and how creative was your excuse?", zh: '这周你拖延了什么事？找的借口有多有创意？' },
    { id: 'q298', cat: 'week', en: "If you could replay one hour from this week, which would you pick?", zh: '如果能把这周的某一个小时重新过一遍，你选哪一个？' },
    { id: 'q299', cat: 'week', en: "What's the nicest message you got this week?", zh: '这周你收到最暖心的一条消息是什么？' },
    { id: 'q300', cat: 'week', en: "What's something new you tried this week, like a place, a shop, or a dish?", zh: '这周你有没有尝试什么新地方、新店或者新菜？' },

    { id: 'q301', cat: 'childhood', en: "What would little you think of the two of us today?", zh: '小时候的你要是看到现在的我们，会怎么想？' },
    { id: 'q302', cat: 'childhood', en: "Which cartoon or TV show did you rush home to watch as a kid?", zh: '小时候你每天急着赶回家看的是哪部动画片或电视剧？' },
    { id: 'q303', cat: 'childhood', en: "What game did you play most at recess or after school?", zh: '小时候课间或者放学后，你最常玩什么游戏？' },
    { id: 'q304', cat: 'childhood', en: "What did you usually spend your pocket money on as a kid?", zh: '小时候的零花钱，你大多花在了什么上面？' },
    { id: 'q305', cat: 'childhood', en: "What's the naughtiest thing you did as a kid that nobody ever found out about?", zh: '小时候你干过最调皮、却一直没被发现的事是什么？' },
    { id: 'q306', cat: 'childhood', en: "What was your bedroom like when you were little?", zh: '你小时候的房间是什么样的？' },
    { id: 'q307', cat: 'childhood', en: "What toy or object did you carry everywhere as a kid?", zh: '小时候你走到哪儿都要带着的玩具或小物件是什么？' },
    { id: 'q308', cat: 'childhood', en: "What did you believe as a kid that turned out to be completely wrong?", zh: '小时候你深信不疑、后来才发现完全不对的事是什么？' },
    { id: 'q309', cat: 'childhood', en: "Who in your family did you get along with best as a kid, and why?", zh: '小时候家里你和谁最合得来？为什么？' },
    { id: 'q310', cat: 'childhood', en: "What was your favorite part of summer vacation as a kid?", zh: '小时候放暑假，你最喜欢做什么？' },
    { id: 'q311', cat: 'childhood', en: "What nickname did your family call you when you were little?", zh: '小时候家里人都叫你什么小名？' },
    { id: 'q312', cat: 'childhood', en: "What did you want most for your birthday when you were little?", zh: '小时候过生日，你最想要的礼物是什么？' },
    { id: 'q313', cat: 'childhood', en: "What's a school memory that still makes you laugh?", zh: '上学时有什么事，你现在想起来还会笑？' },
    { id: 'q314', cat: 'childhood', en: "Where did you usually sit in class, and what was your desk mate like?", zh: '上学时你一般坐在教室哪个位置？你的同桌是个什么样的人？' },
    { id: 'q315', cat: 'childhood', en: "What book or story did you love as a child?", zh: '小时候你最爱的一本书或一个故事是什么？' },
    { id: 'q316', cat: 'childhood', en: "Which rule at home felt the most unfair to you as a kid?", zh: '小时候家里哪条规矩让你觉得最不公平？' },
    { id: 'q317', cat: 'childhood', en: "What did a perfect day look like when you were eight?", zh: '八岁的你眼中，完美的一天是什么样的？' },
    { id: 'q318', cat: 'childhood', en: "Which grown-up spoiled you the most when you were little?", zh: '小时候哪个大人最惯着你？' },
    { id: 'q319', cat: 'childhood', en: "What's a dish from your childhood you'd love for me to taste someday?", zh: '你小时候常吃的哪道菜，最想让我也尝一尝？' },
    { id: 'q320', cat: 'childhood', en: "What's a song from your childhood you can still sing every word of?", zh: '有哪首小时候的歌，你到现在还能一字不差地唱出来？' },
    { id: 'q321', cat: 'childhood', en: "How did you get to school, and what do you remember about the way there?", zh: '小时候你怎么去上学？路上有什么让你印象深刻？' },
    { id: 'q322', cat: 'childhood', en: "Did you have a secret hideout as a kid, and where was it?", zh: '小时候你有没有自己的秘密基地？在哪儿？' },
    { id: 'q323', cat: 'childhood', en: "When you were little, what did you think grown-ups did all day?", zh: '小时候你以为大人整天都在忙些什么？' },
    { id: 'q324', cat: 'childhood', en: "What's a holiday or festival memory from childhood that you miss?", zh: '小时候过年过节，有什么回忆是你现在特别怀念的？' },
    { id: 'q325', cat: 'childhood', en: "Did you have a pet as a kid, or badly want one?", zh: '小时候你养过宠物吗？还是一直特别想养？' },
    { id: 'q326', cat: 'childhood', en: "What were you like as a little kid: loud, shy, curious, or something else?", zh: '小时候的你是什么性格？爱闹、害羞、好奇，还是别的样子？' },
    { id: 'q327', cat: 'childhood', en: "If you could spend an afternoon with yourself at age seven, what would you two do?", zh: '如果能陪七岁的自己过一个下午，你们会一起做什么？' },
    { id: 'q328', cat: 'childhood', en: "Who taught you to ride a bike or swim, and how did it go?", zh: '小时候是谁教你骑车或游泳的？学得顺利吗？' },
    { id: 'q329', cat: 'childhood', en: "What did you daydream about in class?", zh: '上课走神的时候，你都在想些什么？' },
    { id: 'q330', cat: 'childhood', en: "What was everyone at your school obsessed with when you were a kid?", zh: '你上学那会儿，同学们都在疯玩或者疯收集什么？' },

    { id: 'q331', cat: 'food', en: "If you could only eat one cuisine for the rest of your life, which would you choose?", zh: '如果这辈子只能吃一种菜系，你选哪一种？' },
    { id: 'q332', cat: 'food', en: "What would be on the menu for your perfect birthday feast?", zh: '如果给你办一桌完美的生日宴，菜单上会有哪些菜？' },
    { id: 'q333', cat: 'food', en: "What street food would you cross the whole city for?", zh: '有什么街头小吃，值得你穿过大半个城市去吃？' },
    { id: 'q334', cat: 'food', en: "What was the first thing we ever cooked together, and how did it turn out?", zh: '我们第一次一起下厨做了什么？结果怎么样？' },
    { id: 'q335', cat: 'food', en: "Sweet, sour, salty, spicy, or bitter: which flavor could you never give up?", zh: '酸甜苦辣咸里，哪一种味道你绝对戒不掉？' },
    { id: 'q336', cat: 'food', en: "What's your most controversial food opinion?", zh: '你有什么关于吃的观点，一说出来就可能引发一场大战？' },
    { id: 'q337', cat: 'food', en: "What's a food that always reminds you of a particular person?", zh: '有什么食物，一吃就会让你想起某个人？' },
    { id: 'q338', cat: 'food', en: "Which three snacks would you pack for a long train ride?", zh: '坐长途火车的话，你会带哪三样零食？' },
    { id: 'q339', cat: 'food', en: "What's the most memorable thing you've eaten while traveling?", zh: '旅行时你吃到过最难忘的东西是什么？' },
    { id: 'q340', cat: 'food', en: "What's a dish you're secretly proud of making?", zh: '有没有哪道菜，是你私下挺得意的拿手菜？' },
    { id: 'q341', cat: 'food', en: "What do you crave most when the weather turns cold?", zh: '天一冷下来，你最馋什么？' },
    { id: 'q342', cat: 'food', en: "What's your ideal late-night snack after a long day?", zh: '忙了一整天，你最理想的夜宵是什么？' },
    { id: 'q343', cat: 'food', en: "Which fruit do you think is overrated, and which one is underrated?", zh: '你觉得哪种水果被高估了？哪种又被低估了？' },
    { id: 'q344', cat: 'food', en: "If the two of us were one dish, what would it be and why?", zh: '如果把我们俩做成一道菜，会是什么菜？为什么？' },
    { id: 'q345', cat: 'food', en: "Which food smell makes you instantly hungry?", zh: '有什么食物的香味，一闻到你就饿了？' },
    { id: 'q346', cat: 'food', en: "Hot pot or barbecue for a night out with friends, and why?", zh: '和朋友聚餐，火锅和烧烤你选哪个？为什么？' },
    { id: 'q347', cat: 'food', en: "What's your usual order at your favorite breakfast spot?", zh: '去你最爱的早餐店，你的固定搭配是什么？' },
    { id: 'q348', cat: 'food', en: "What's a food you've always wanted to try but haven't yet?", zh: '有什么食物你一直想尝，却还没尝过？' },
    { id: 'q349', cat: 'food', en: "What's the strangest thing you've ever eaten?", zh: '你吃过最奇怪的东西是什么？' },
    { id: 'q350', cat: 'food', en: "If you could keep only three seasonings in the kitchen, which would you keep?", zh: '如果厨房里只能留三种调料，你留哪三种？' },
    { id: 'q351', cat: 'food', en: "What's a dish you've never managed to get right, no matter how many times you try?", zh: '有什么菜你试了好多次，总是做不好？' },
    { id: 'q352', cat: 'food', en: "If anyone at all could cook for you for a day, famous chef or family member, who would you pick?", zh: '如果能请任何人给你做一天饭，不管是名厨还是家里人，你选谁？' },
    { id: 'q353', cat: 'food', en: "What's the longest you've ever queued for one dish, and was it worth it?", zh: '你为了一口吃的排过最久的队有多久？值得吗？' },
    { id: 'q354', cat: 'food', en: "What's something you'll always order if you see it on a menu?", zh: '有什么菜只要在菜单上看到，你就一定会点？' },
    { id: 'q355', cat: 'food', en: "What's a stubborn little food rule you follow, like never letting certain things touch?", zh: '你吃东西有什么固执的小讲究，比如哪些东西绝对不能混在一起？' },
    { id: 'q356', cat: 'food', en: "If we invited friends over for dinner, what should the star dish be?", zh: '如果我们请朋友来家里吃饭，你觉得压轴菜应该是什么？' },
    { id: 'q357', cat: 'food', en: "Which dessert can you never say no to?", zh: '有什么甜品，是你永远无法拒绝的？' },
    { id: 'q358', cat: 'food', en: "What's a dish you think tastes even better the next day?", zh: '有什么菜你觉得隔夜再吃反而更香？' },
    { id: 'q359', cat: 'food', en: "What's the first thing you want to eat when you get back from a trip?", zh: '每次出远门回来，你第一顿最想吃什么？' },
    { id: 'q360', cat: 'food', en: "Who's the best cook you know, and what's their signature dish?", zh: '你认识的人里谁的厨艺最好？招牌菜是什么？' }
  ];

  // Weather for how the week felt, best first.
  const MOODS = [
    { v: 5, glyph: '☀️', en: 'Sunny', zh: '晴' },
    { v: 4, glyph: '🌤️', en: 'Mostly sunny', zh: '多云转晴' },
    { v: 3, glyph: '☁️', en: 'Cloudy', zh: '多云' },
    { v: 2, glyph: '🌧️', en: 'Rainy', zh: '小雨' },
    { v: 1, glyph: '⛈️', en: 'Stormy', zh: '雷阵雨' }
  ];

  // The weekly check-in: how each of us is really doing. Append-only, like BANK (answers keep the id).
  const WEEKLY = [
    { id: 'w01', en: "What's taking up the most space in your head this week?", zh: '这周你脑子里最占地方的是什么事？' },
    { id: 'w02', en: "What would make this week feel a little lighter?", zh: '有什么能让你这周过得轻松一点？' },
    { id: 'w03', en: "What do you need more of from me this week?", zh: '这周你希望我多给你一点什么？' },
    { id: 'w04', en: "What gave you energy this week, and what drained it?", zh: '这周什么给了你能量？什么又让你耗电？' },
    { id: 'w05', en: "Beyond “fine”, how are you really doing this week?", zh: '除了“还行”，这周你真实的状态怎么样？' },
    { id: 'w06', en: "Is there anything you've been carrying on your own that you'd like to share with me?", zh: '有没有什么事你一直一个人扛着，想跟我说说？' },
    { id: 'w07', en: "How have you been sleeping, and do you feel rested?", zh: '这周你睡得怎么样？觉得休息够了吗？' },
    { id: 'w08', en: "What's one thing you'd like to let go of before next week?", zh: '下周开始前，你想放下哪件事？' },
    { id: 'w09', en: "When did you feel most at ease this week?", zh: '这周什么时候你觉得最放松、最自在？' },
    { id: 'w10', en: "How have you been feeling about yourself this week?", zh: '这周你对自己的感觉怎么样？' },
    { id: 'w11', en: "Is there anything between us this week that you'd like to talk about?", zh: '这周我们之间，有没有什么事你想聊一聊？' },
    { id: 'w12', en: "How close to me did you feel this week?", zh: '这周你觉得和我够亲近吗？' },
    { id: 'w13', en: "What turned out to be harder than it looked this week?", zh: '这周有什么事，比你想象的要难？' },
    { id: 'w14', en: "If a kind friend looked back on your week, what would they tell you?", zh: '如果一个温柔的朋友回顾你这一周，会对你说什么？' },
    { id: 'w15', en: "What do you want next week to feel like?", zh: '你希望下一周是什么感觉？' },
    { id: 'w16', en: "Where did you feel stretched too thin this week?", zh: '这周有哪些时候，你觉得自己快顾不过来了？' },
    { id: 'w17', en: "What helped you get through the tough bits of this week?", zh: '这周不顺的时候，是什么帮你撑过来的？' },
    { id: 'w18', en: "Is there something you'd like more time for next week?", zh: '下周你想多留点时间给什么？' },
    { id: 'w19', en: "In a word or two, how's your heart this week?", zh: '用一两个词形容，这周你的心情怎么样？' },
    { id: 'w20', en: "Which moment from this week would you like to hold onto?", zh: '这周有哪个瞬间，是你想好好留住的？' },
    { id: 'w21', en: "What have you been putting pressure on yourself about lately?", zh: '最近你在什么事上给自己压力太大了？' },
    { id: 'w22', en: "Who or what took good care of you this week?", zh: '这周有什么人或什么事，让你觉得被好好照顾了？' },
    { id: 'w23', en: "What would you like to hear from me this week?", zh: '这周你想听我对你说些什么？' },
    { id: 'w24', en: "What did you need this week that you didn't quite get?", zh: '这周你有什么需要，是没怎么被满足的？' },
    { id: 'w25', en: "How much room did you have for fun this week?", zh: '这周你给自己留了多少玩乐的空间？' },
    { id: 'w26', en: "What's one gentle thing you'll do for yourself next week?", zh: '下周你打算为自己做一件什么温柔的小事？' }
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

  // ---------- rotation: each cycle of L slots is a seeded shuffle, so nothing repeats within a cycle ----------
  function mulberry32(a) {
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // The salt keeps each rotation (daily bank, weekly check-in) independent. The daily bank uses salt 0,
  // which gives exactly the seeds it always had.
  const DAILY_SALT = 0, WEEKLY_SALT = 0x5745454B;
  function shuffled(cycle, L, salt) {
    const rand = mulberry32(((cycle + 1) ^ salt) >>> 0), order = Array.from({ length: L }, (_, i) => i);
    for (let i = L - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return order;
  }
  // A new cycle opens with GAP items that were not in the last GAP slots of the previous one, so nothing
  // comes back within GAP slots across a boundary. The tail of each order stays as shuffled (GAP <= L / 3).
  const orders = new Map();
  function orderFor(cycle, L, maxGap, salt) {
    const key = salt + ':' + maxGap + ':' + cycle + ':' + L;
    if (!orders.has(key)) {
      const raw = shuffled(cycle, L, salt), gap = Math.min(maxGap, Math.floor(L / 3));
      const recent = new Set(shuffled(cycle - 1, L, salt).slice(L - gap)), head = [];
      for (const i of raw) { if (head.length === gap) break; if (!recent.has(i)) head.push(i); }
      const lead = new Set(head);
      orders.set(key, [...head, ...raw.filter(i => !lead.has(i))]);
    }
    return orders.get(key);
  }
  // index for slot n (any integer, negative before the epoch) of a rotation over L items
  const pick = (n, L, maxGap, salt) => orderFor(Math.floor(n / L), L, maxGap, salt)[((n % L) + L) % L];

  function bankFor(iso) {
    const t = parse(iso);
    if (t === null) return null;
    const b = BANK[pick(Math.round((t - EPOCH) / DAY), BANK.length, 30, DAILY_SALT)];
    return { qid: b.id, cat: b.cat, en: b.en, zh: b.zh };
  }

  // ---------- weekly check-in: one prompt per Monday to Sunday week ----------
  const WEEK_EPOCH = Date.UTC(2026, 0, 5); // a Monday
  function weekOf(iso) { // the Monday of the week containing iso
    const t = parse(iso);
    return t === null ? null : toIso(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY);
  }
  function forWeek(iso) {
    const monday = weekOf(iso);
    if (monday === null) return null;
    const w = WEEKLY[pick(Math.round((parse(monday) - WEEK_EPOCH) / (7 * DAY)), WEEKLY.length, 4, WEEKLY_SALT)];
    return { qid: w.id, cat: 'checkin', en: w.en, zh: w.zh };
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

  const api = { CATEGORIES, BANK, MOODS, WEEKLY, bankFor, schedule, forDay, nextFreeDay, weekOf, forWeek };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.CCQuestions = api;
})();
