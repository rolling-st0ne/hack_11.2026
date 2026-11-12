import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/mark/.codex/plugins/cache/openai-primary-runtime/presentations/26.1103.10131/skills/presentations/container_tools/artifact_tool_utils.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const skill='/Users/mark/.codex/plugins/cache/openai-primary-runtime/presentations/26.1103.10131/skills/presentations';
const python='/Users/mark/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12';
const spec='/Users/mark/Downloads/ТЗ_Хакатон_Единая_система_управления_компанией.pdf';
const repo='/Users/mark/Origin/Projects/hack_11.2026/fotoprint';
const C={bg:'#F3F6F4',ink:'#172D2B',muted:'#4A625E',green:'#106B54',line:'#AABEB7',dark:'#102B28',white:'#F6FBF8',accent:'#8CE4B9'};
const font='Arial';
const presentation=Presentation.create({slideSize:{width:1280,height:720}});
function text(slide,content,x,y,w,h,size=28,color=C.ink,bold=false){const s=slide.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});s.text=content;s.text.style={typeface:font,fontSize:size,color,bold,verticalAlignment:'middle'};s.text.insets=0;return s;}
function slide(title,notes,dark=false){const s=presentation.slides.add();s.background.fill=dark?C.dark:C.bg;text(s,title,64,46,1140,78,44,dark?C.white:C.ink,true);text(s,String(presentation.slides.items.length),1185,650,40,26,18,dark?C.accent:C.muted);s.speakerNotes.text=notes+'\n\nИсточник ТЗ: '+spec+'\nРедакция 2.0 от 02.09.2026. Трек 1. Синтетические данные; реальные подключения и промышленная эксплуатация не заявлены.';return s;}
function node(slide,content,x,y,w,h,fill=C.bg,color=C.ink,size=26){const s=slide.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:C.green,width:2}});s.text=content;s.text.style={typeface:font,fontSize:size,color,bold:true,alignment:'center',verticalAlignment:'middle'};s.text.insets=16;return s;}
function connect(s,a,b,from='right',to='left'){s.shapes.connect(a,b,{kind:'straight',fromSide:from,toSide:to,line:{fill:C.green,width:3},tail:{type:'triangle',width:'med',length:'med'}});}
function list(slide,items,x,y,w,size=27,gap=70,color=C.ink){items.forEach((item,i)=>text(slide,item,x,y+i*gap,w,gap-6,size,color));}

// 1. Cover, deliberately minimal.
{
 const s=presentation.slides.add();s.background.fill=C.dark;
 text(s,'Фотопринт\nКонтур управления',64,154,1120,180,68,C.white,true);
 text(s,'Управленческая платформа · трек 1',68,370,1100,55,32,C.accent);
 text(s,'Локальный / LAN-прототип на синтетических данных',68,566,1090,46,26,C.white);
 s.speakerNotes.text='Цель: руководитель видит отклонение, разбирает его причину и фиксирует проверяемое действие. Прототип предназначен для демонстрации сценария на тестовых данных. Не утверждать измеренный экономический эффект или промышленную готовность.\nИсточники: '+spec+' (§5.1, §5.2); '+repo+'/README.md.';
}
// 2. Roles and concrete managerial need.
{
 const s=slide('Пользователи и управленческая задача','Пояснить роли до демонстрации. Руководители имеют разные продуктовые направления; аналитик читает данные и проверяет качество, но не меняет решения.\nИсточники: '+repo+'/server/seed.mjs (ACTORS); '+repo+'/server/api.mjs; ТЗ §5.1.');
 text(s,'Показатель, причина и ответственное действие\nдолжны быть связаны в одном рабочем контуре.',64,154,1125,104,36,C.ink,true);
 const xs=[64,464,864],titles=['Директор','Руководитель\nподразделения','Аналитик'];
 const bodies=[['Общая картина компании','Финансы и ресурсы','Приоритеты и решения'],['Своё направление','Заказы и отклонения','Владелец, срок, проверка'],['Качество источников','Свежесть и сверка','Чтение без изменения решений']];
 xs.forEach((x,i)=>{text(s,titles[i],x,306,350,88,32,C.green,true);list(s,bodies[i],x,414,350,25,59);});
}
// 3. Integrated synthetic domains as native table.
{
 const s=slide('Интегрированные данные','Четыре предметные области представлены реалистичными CSV-имитациями и соединяются идентификаторами. Filesystem — транспорт, а не четыре реальных подключения. Прогноз мощности использует календарь shifts.csv.\nИсточники: '+repo+'/server/adapters.mjs; '+repo+'/server/seed.mjs; '+repo+'/server/reporting.mjs; ТЗ УП-01 и §8.');
 const values=[['Область','Данные','Связь'],['CRM / поддержка','Клиенты, обращения, ответы','customerId · orderId'],['ERP / производство','Заказы, продукт, сроки, качество','orderId · productId'],['Финансы','Доходы, расходы, план / факт','orderId · currency'],['Персонал','Штат, отсутствие, календарь смен','department · employeeId']];
 const table=s.tables.add({rows:5,columns:3,left:64,top:164,width:1150,height:312,columnWidths:[310,530,310],values});
 table.cells.block({row:0,column:0,rowCount:5,columnCount:3}).assign({textStyle:{typeface:font,fontSize:24,color:C.ink},margins:{top:12,bottom:12,left:14,right:14},fill:C.bg,borders:{style:'solid',fill:C.line,width:1}});
 table.cells.block({row:0,column:0,rowCount:1,columnCount:3}).assign({fill:C.dark,textStyle:{typeface:font,fontSize:25,color:C.white,bold:true}});
 [[64,'1 800','заказов'],[464,'360','клиентов'],[864,'800','обращений']].forEach(([x,num,label])=>{text(s,num,x,510,320,65,52,C.green,true);text(s,label,x,580,320,40,26,C.muted);});
}
// 4. Dashboard and traceability.
{
 const s=slide('Дашборд и детализация KPI','Показать фильтр периода, подразделения и продукта, затем открыть KPI и связанное основание. Число 18 относится к встроенным KPI; пользовательские метрики добавляются отдельно. Прогноз сценарный, не ML-модель.\nИсточники: '+repo+'/server/analytics.mjs; '+repo+'/server/metric-config.mjs; '+repo+'/client/app.js; ТЗ §5.2.1–5.2.2, §5.2.4, УП-02/03.');
 text(s,'18',64,160,190,100,82,C.green,true);
 text(s,'вычисляемых KPI',250,180,850,72,42,C.ink,true);
 list(s,['План, факт, прогноз и статус','Период · подразделение · продукт','Разрез до заказа или причины отклонения'],64,300,1100,30,70);
 text(s,'Формула  →  источник  →  время обновления',64,546,1120,50,32,C.green,true);
 text(s,'Спрос и доступная мощность — на четыре недели; дефицит виден по неделям.',64,615,1100,48,25,C.muted);
}
// 5. Explicit editable decision workflow.
{
 const s=slide('Решение и повторная проверка','Показать один красный сигнал. В карточке: проблема, влияние, причина, действие, владелец, срок, приоритет и статус. Назначение должно быть доступно владельцу. После выполнения создать неуспешную проверку, затем успешную; журнал сохраняет обе.\nИсточники: '+repo+'/server/api.mjs; '+repo+'/server/protocol.mjs; ТЗ §5.2.3, УП-04.');
 const labels=['Отклонение','Причина','Решение','Действие','Проверка'];
 const nodes=labels.map((v,i)=>node(s,v,64+i*236,220,208,100,i===4?C.green:C.bg,i===4?C.white:C.ink,27));
 nodes.slice(0,-1).forEach((n,i)=>connect(s,n,nodes[i+1]));
 text(s,'Карточка решения',64,374,430,50,34,C.green,true);
 text(s,'Проблема и влияние · причина\nДействие · владелец · срок\nПриоритет · статус · история',64,444,650,146,29);
 text(s,'Цель не достигнута',820,374,390,50,29,C.ink,true);
 text(s,'Оставить на контроле\nи повторить проверку',820,438,390,104,28,C.muted);
 text(s,'Закрытие — после подтверждённого результата',64,626,1110,40,27,C.green,true);
}
// 6. Native architecture diagram, not a screenshot.
{
 const s=slide('Локальная архитектура и защита','Пояснить границу браузера и серверного API. В LAN доступен клиент на порту 3000; API привязан к loopback на 8080. Права и расчёты выполняет API. Изменения фиксируются снимком CSV; CURRENT переключается только после проверки читаемости. Служебные пароли и сессии не входят в исходные CSV.\nИсточники: '+repo+'/client/dev-server.mjs; '+repo+'/server/server.mjs; '+repo+'/server/auth.mjs; '+repo+'/server/filesystem-store.mjs; '+repo+'/server/config-api.mjs.');
 const n=[node(s,'Браузер',64,188,210,105),node(s,'Клиент\nи proxy :3000',340,188,245,105),node(s,'API :8080\nправа и расчёты',650,188,265,105),node(s,'CSV\nснимки',980,188,235,105)];
 for(let i=0;i<3;i++)connect(s,n[i],n[i+1]);
 list(s,['Персональный вход и серверные ограничения ролей','Проверка типов, ключей и связей до импорта','Аудит: пользователь, время, объект и результат'],64,369,1130,29,65);
 text(s,'Настройка агентом: предложение → просмотр → явное подтверждение',64,595,1140,60,27,C.green,true);
}
// 7. Six-minute demonstration with native timeline table.
{
 const s=slide('Демонстрация за шесть минут','Ориентир для живой демонстрации — 6 минут, отдельно от выступления по слайдам. Заранее получить тестовые пароли владельца стенда; не показывать ACCESS.txt на общем экране. Выполнять на чистом демонаборе. Сбой источника имитируется средствами приложения; реальные сервисы не отключать.\nИсточники: '+repo+'/DEMO.md; '+repo+'/README.md; ТЗ §9.3 и §11.');
 const values=[['Время','Действие и наблюдаемый результат'],['0:00–0:40','Войти директором; открыть дашборд'],['0:40–1:40','Выбрать срез; раскрыть KPI, формулу и источник'],['1:40–3:20','Открыть сигнал; назначить решение и выполнить действие'],['3:20–4:20','Проверить результат; показать статус и журнал'],['4:20–5:10','Войти руководителем; проверить границу его направления'],['5:10–6:00','Аналитик: свежесть, ошибки данных и финансовая сверка']];
 const table=s.tables.add({rows:7,columns:2,left:64,top:156,width:1150,height:460,columnWidths:[220,930],values});
 table.cells.block({row:0,column:0,rowCount:7,columnCount:2}).assign({textStyle:{typeface:font,fontSize:25,color:C.ink},margins:{top:10,bottom:10,left:15,right:15},fill:C.bg,borders:{style:'solid',fill:C.line,width:1}});
 table.cells.block({row:0,column:0,rowCount:1,columnCount:2}).assign({fill:C.dark,textStyle:{typeface:font,fontSize:25,color:C.white,bold:true}});
}
// 8. A bounded pilot plan, no unmeasured success claims.
{
 const s=slide('Подготовка пилота','Перед промышленным внедрением необходимо согласовать владельцев данных, реальные интеграции, основания обработки персональных данных, SLA и сопровождение. Метрики эффекта на слайде являются предложением для пилота, а не уже достигнутым результатом.\nИсточник: '+spec+' (§13); '+repo+'/README.md.');
 text(s,'1. Данные и владельцы',64,164,550,52,34,C.green,true);
 text(s,'Согласовать определения KPI,\nправа, смены и качество исходных данных.',64,229,1100,83,29);
 text(s,'2. Интеграции и эксплуатация',64,339,1000,52,34,C.green,true);
 text(s,'Подключить CRM / ERP / 1С, настроить SSO,\nрезервное копирование, мониторинг и SLA.',64,404,1100,83,29);
 text(s,'3. Проверка бизнес-эффекта',64,514,1000,52,34,C.green,true);
 text(s,'Измерить время разбора отклонения и долю решений,\nпроверенных в срок. Исходный уровень фиксируется до пилота.',64,579,1120,80,28);
}

await fs.mkdir(path.join(base,'build'),{recursive:true});
await fs.mkdir(path.join(base,'previews'),{recursive:true});
await fs.mkdir(path.join(base,'output'),{recursive:true});
const candidate=path.join(base,'build/candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
const final=path.join(base,'output/fotoprint-track1.pptx');
const result=await finalizePresentation({workspaceDir:base,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit','--require-native-table-slide','3','--require-native-table-slide','7','--cover-role','cover'],requiredNativeTableOwnerSlides:[3,7],explicitTotalSlideCount:8,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(base,'build/validation.json')});
console.log(JSON.stringify(result));
const imported=await PresentationFile.importPptx(await FileBlob.load(final));
for(const [i,s] of imported.slides.items.entries()){
 const blob=await imported.export({slide:s,format:'png',scale:1});
 await fs.writeFile(path.join(base,'previews',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await blob.arrayBuffer()));
}
console.log('Rendered all 8 final slides.');
