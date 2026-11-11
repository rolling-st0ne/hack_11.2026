import { generateFacts } from './analytics.mjs';
export const STAGES = ['Сигнал', 'Клиент', 'Заказ', 'Проверка', 'Производство', 'Доставка', 'Поддержка', 'Возврат'];
export const ACTORS = {
  executive: { key:'executive', id:'elena', name:'Елена Волкова', initials:'ЕВ', role:'executive', level:1, title:'Директор', scope:'all', departments:['books','photo','gifts'], focus:'Компания', pages:['overview','sales','production','finance','flow','decisions','audit','integrations','dictionary'] },
  maxim: { key:'maxim', id:'maxim', name:'Сущёнок Максим', initials:'СМ', role:'manager', level:2, title:'Заместитель директора по работе с клиентами', scope:'photo', departments:['photo'], focus:'Работа с клиентами', pages:['overview','sales','flow','decisions','audit','dictionary'] },
  sergey: { key:'sergey', id:'sergey', name:'Зыков Сергей', initials:'ЗС', role:'manager', level:2, title:'Заместитель директора по развитию', scope:'development', departments:['books','gifts'], focus:'Развитие', pages:['overview','sales','production','finance','flow','decisions','audit','dictionary'] },
  operator: { key:'operator', id:'mikhail', name:'Михаил Козлов', initials:'МК', role:'operator', level:3, title:'Специалист производства', scope:'books', departments:['books'], focus:'Моя смена', pages:['overview','flow','decisions','audit','dictionary'] },
  support_staff: { key:'support_staff', id:'daria', name:'Дарья Соколова', initials:'ДС', role:'operator', level:3, title:'Специалист поддержки', scope:'photo', departments:['photo'], focus:'Мои обращения', pages:['overview','flow','decisions','audit','dictionary'] },
  growth_staff: { key:'growth_staff', id:'igor', name:'Игорь Петров', initials:'ИП', role:'operator', level:3, title:'Координатор заказов', scope:'gifts', departments:['gifts'], focus:'Мои заказы', pages:['overview','flow','decisions','audit','dictionary'] },
};
export const canAccessDepartment=(actor,department)=>actor.departments.includes(department);
export const departmentOwner=department=>({books:'mikhail',photo:'daria',gifts:'igor'}[department]);
export const OWNERS = [
  { id: 'mikhail', name: 'Михаил Козлов', department: 'Производство', initials: 'МК' },
  { id: 'daria', name: 'Дарья Соколова', department: 'Поддержка', initials: 'ДС' },
  { id: 'igor', name: 'Игорь Петров', department: 'Логистика', initials: 'ИП' },
  { id: 'anna', name: 'Анна Смирнова', department: 'Операции', initials: 'АС' },
];
export const KPI = [
  { id: 'customers', label: 'Клиенты', value: '2 846', unit: '', change: '+12,8%', trend: 'positive', description: 'активных клиентов', icon: 'users', series: [18,22,21,29,25,33,32,42,39,49,46,61], owner: 'Анна Смирнова', formula: 'Уникальные клиенты с заказом за выбранный период', source: 'CRM / Битрикс24', target: 'Рост ≥ 10% к прошлому периоду', state: 'В норме' },
  { id: 'orders', label: 'Заказы', value: '1 284', unit: '', change: '+8,2%', trend: 'positive', description: 'принято в работу', icon: 'box', series: [20,28,25,34,31,41,36,48,43,55,50,65], owner: 'Анна Смирнова', formula: 'Количество уникальных заказов, принятых ERP', source: 'ERP / Производство', target: 'Выполнение плана ≥ 95%', state: 'В норме' },
  { id: 'moderation', label: 'Модерация', value: '47', unit: '', change: '+18', trend: 'negative', description: 'заказов в очереди', icon: 'scan', series: [14,13,19,18,24,22,30,28,37,35,42,47], owner: 'Михаил Козлов', formula: 'Заказы со статусом «На проверке» без результата проверки', source: 'ERP / Производство', target: 'Очередь ≤ 30 заказов', state: 'Требует внимания', signal: 'SIG-1042' },
  { id: 'production', label: 'Производство', value: '86', unit: '%', change: '+4 п.п.', trend: 'neutral', description: 'загрузка мощностей', icon: 'factory', series: [60,65,62,69,67,76,72,78,80,78,84,86], owner: 'Михаил Козлов', formula: 'Занятые машино-часы / доступные машино-часы × 100%', source: 'ERP / Производство', target: 'Загрузка 70–90%', state: 'В норме' },
  { id: 'quality', label: 'Качество', value: '98,6', unit: '%', change: '+0,4 п.п.', trend: 'positive', description: 'без повторной печати', icon: 'shield', series: [74,78,76,81,80,86,83,87,85,93,90,97], owner: 'Михаил Козлов', formula: 'Заказы без перепечатки / выпущенные заказы × 100%', source: 'ERP / Производство', target: 'Качество ≥ 98%', state: 'В норме' },
  { id: 'support', label: 'Поддержка', value: '92,4', unit: '%', change: '−3,1 п.п.', trend: 'negative', description: 'обращений в SLA', icon: 'headphones', series: [95,93,96,91,93,89,91,87,89,84,86,82], owner: 'Дарья Соколова', formula: 'Обращения с первым ответом ≤ 15 мин / все обращения × 100%', source: 'Поддержка / Омниканал', target: 'SLA ≥ 95%', state: 'Ниже цели', signal: 'SIG-1041' },
  { id: 'delivery', label: 'Доставка', value: '96,8', unit: '%', change: '−1,2 п.п.', trend: 'negative', description: 'заказов точно в срок', icon: 'truck', series: [96,98,95,96,92,95,91,93,89,92,88,87], owner: 'Игорь Петров', formula: 'Доставлено до обещанного срока / доставленные заказы × 100%', source: 'ERP / Производство', target: 'Доставка в срок ≥ 98%', state: 'Есть задержки', signal: 'SIG-1040' },
  { id: 'team', label: 'Команда', value: '24', unit: '/ 28', change: '4 свободны', trend: 'neutral', description: 'сотрудника на смене', icon: 'team', series: [16,18,18,20,19,22,23,21,24,23,25,24], owner: 'Анна Смирнова', formula: 'Сотрудники на активной смене / запланированные сотрудники', source: 'HR / Персонал', target: 'Обеспеченность смены ≥ 85%', state: 'Ресурс доступен' },
];
export function createSeed() {
  const now = Date.now();
  const ago = min => new Date(now - min * 60000).toISOString();
  const order = (id,client,product,stage,owner,status,minutes,department) => ({ id,client,product,stage,owner,status,department,payment:'Оплачен',createdAt:ago(minutes+60),updatedAt:ago(minutes),events:STAGES.map((name,i)=>({id:`${id}-${i}`,stage:i,name,source:['crm','crm','erp','erp','erp','erp','support','crm'][i],status:i<stage?'completed':i===stage?'active':'pending',owner:i<4?'anna':i<6?'mikhail':'daria',at:i<=stage?ago(minutes+(stage-i)*14):null,result:i<stage?['Обращение зарегистрировано','Контекст клиента связан','Заказ принят, оплата подтверждена','Макет прошёл проверку','Тираж выпущен','Передано получателю','Обращение решено','Повторный сценарий создан'][i]:null})) });
  return {
    schemaVersion:2, facts:generateFacts(now), sessions:{}, idempotency:{}, sourceEvents:[], checks:[],
    connectors:[
      {id:'crm',name:'Битрикс24',category:'Клиенты и сделки',short:'Б24',color:'blue',events:1248,status:'connected',lastSync:ago(2),failure:false},
      {id:'support',name:'Омниканал',category:'Поддержка и SLA',short:'ОМ',color:'purple',events:386,status:'connected',lastSync:ago(3),failure:false},
      {id:'erp',name:'Производство',category:'Заказы и логистика',short:'ERP',color:'green',events:2846,status:'connected',lastSync:ago(1),failure:false},
      {id:'finance',name:'1С: Финансы',category:'Статусы оплат и затрат',short:'1С',color:'yellow',events:912,status:'connected',lastSync:ago(4),failure:false},
      {id:'hr',name:'HR / Персонал',category:'Команда и смены',short:'HR',color:'pink',events:124,status:'connected',lastSync:ago(5),failure:false},
    ],
    signals:[
      {id:'SIG-1042',title:'Растёт очередь модерации',description:'47 заказов ожидают проверки макетов. Очередь на 57% выше допустимого уровня.',severity:'critical',department:'books',metric:'moderation',value:47,target:30,unit:'заказов',source:'erp',sourceEventId:'erp-moderation-1042',orderId:'FP-2847',cause:'На участке фотокниг один модератор вместо трёх. После утренней рассылки поток заказов вырос на 34%.',evidence:'ERP: 47 заказов в статусе «На проверке»; HR: 1 из 3 модераторов на смене.',suggestion:'Перевести двух сотрудников на проверку макетов и разобрать очередь до 30 заказов.',owner:'mikhail',status:'open',createdAt:ago(12)},
      {id:'SIG-1041',title:'Время ответа выходит за SLA',description:'18 обращений без ответа более 15 минут. SLA первого ответа снизился до 92,4%.',severity:'warning',department:'photo',metric:'support',value:92.4,target:95,unit:'%',source:'support',sourceEventId:'support-sla-1041',orderId:'FP-2841',cause:'В чате накопились вопросы о сроках фотокниг. Два специалиста заняты обработкой возвратов.',evidence:'Омниканал: 18 просроченных обращений; HR: 2 из 5 специалистов доступны в чате.',suggestion:'Подключить дежурного специалиста и обработать просроченные обращения.',owner:'daria',status:'open',createdAt:ago(28)},
      {id:'SIG-1040',title:'Риск задержки доставки',description:'12 заказов не переданы перевозчику. Срок передачи — до 16:00.',severity:'warning',department:'gifts',metric:'delivery',value:96.8,target:98,unit:'%',source:'erp',sourceEventId:'erp-delivery-1040',orderId:'FP-2836',cause:'Утренний рейс перевозчика отменён. Готовые заказы ожидают следующего забора.',evidence:'ERP: 12 заказов «Готов к отгрузке»; перевозчик подтвердил отмену рейса.',suggestion:'Согласовать дополнительный забор с резервным перевозчиком.',owner:'igor',status:'open',createdAt:ago(46)},
    ],
    orders:[order('FP-2847','Студия «Свет»','Фотокнига • 20 × 20 • 3 шт.',3,'mikhail','На проверке',12,'books'),order('FP-2846','Мария Л.','Фотографии • 10 × 15 • 48 шт.',4,'mikhail','В производстве',19,'photo'),order('FP-2845','Арт-бюро «Форма»','Холст • 60 × 80 • 2 шт.',4,'mikhail','В производстве',24,'gifts'),order('FP-2841','Дмитрий К.','Фотокнига • 30 × 30 • 1 шт.',6,'daria','Обращение открыто',28,'photo'),order('FP-2836','Студия «Моменты»','Календарь • A3 • 25 шт.',5,'igor','Ожидает перевозчика',46,'gifts'),order('FP-2832','Анна П.','Фотографии • 10 × 15 • 120 шт.',7,'anna','Повторный заказ',58,'books')],
    tasks:[
      {id:'DEC-021',title:'Проверить цветопередачу нового тиража',owner:'mikhail',department:'books',dueAt:new Date(now+3*3600000).toISOString(),status:'in_progress',signalId:null,orderId:'FP-2845',createdAt:ago(86),createdBy:'anna',description:'Сравнить контрольную печать с эталоном перед выпуском партии.',result:null},
      {id:'DEC-020',title:'Обновить график вечерней смены',owner:'anna',department:'books',dueAt:new Date(now+8*3600000).toISOString(),status:'done',signalId:null,orderId:null,createdAt:ago(180),createdBy:'anna',description:'Согласовать покрытие смены и зафиксировать график.',result:'График подтверждён руководителем смены.',verifiedAt:ago(40)},
    ],
    audit:[
      {id:crypto.randomUUID(),at:ago(1),actor:'system',actorName:'ERP / Производство',action:'sync',object:'erp',result:'Синхронизированы статусы 24 заказов',success:true},
      {id:crypto.randomUUID(),at:ago(12),actor:'system',actorName:'Правила контура',action:'signal',object:'SIG-1042',result:'Очередь модерации превысила порог: 47 / 30',success:true},
      {id:crypto.randomUUID(),at:ago(40),actor:'anna',actorName:'Анна Смирнова',action:'verify',object:'DEC-020',result:'График вечерней смены подтверждён',success:true},
      {id:crypto.randomUUID(),at:ago(86),actor:'anna',actorName:'Анна Смирнова',action:'create',object:'DEC-021',result:'Назначена проверка цветопередачи → Михаил Козлов',success:true},
    ],lastUpdated:ago(1),
  };
}
