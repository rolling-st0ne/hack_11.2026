import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Presentation,PresentationFile,FileBlob} from '@oai/artifact-tool';
import {finalizePresentation} from '/Users/mark/.codex/plugins/cache/openai-primary-runtime/presentations/26.1103.10131/skills/presentations/container_tools/artifact_tool_utils.mjs';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const skill='/Users/mark/.codex/plugins/cache/openai-primary-runtime/presentations/26.1103.10131/skills/presentations';
const python='/Users/mark/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12';
const font='Arial';
const C={paper:'#F3F1E9',ink:'#15221B',muted:'#68736B',line:'#CDD2C7',dark:'#101D17',green:'#295C43',mint:'#C9F47A',white:'#F9FBF4',coral:'#EB8D72',dim:'#AABAAF',panel:'#20392C'};
const W=1280,H=720;
const p=Presentation.create({slideSize:{width:W,height:H}});
function shape(s,g,x,y,w,h,fill='none',stroke='none',weight=0,r=0){return s.shapes.add({geometry:g,position:{left:x,top:y,width:w,height:h,rotation:r},fill,line:{fill:stroke,width:weight}});}
function txt(s,t,x,y,w,h,size=28,color=C.ink,bold=false,align='left'){const v=shape(s,'textbox',x,y,w,h);v.text=t;v.text.style={typeface:font,fontSize:size,color,bold,alignment:align,verticalAlignment:'middle'};v.text.insets=0;return v;}
function line(s,x,y,w,color=C.line,width=1){return shape(s,'line',x,y,w,0,'none',color,width);}
function ring(s,x,y,d,color,width=2){return shape(s,'ellipse',x,y,d,d,'none',color,width);}
function circle(s,x,y,d,color){return shape(s,'ellipse',x,y,d,d,color);}
function brand(s,dark){const c=dark?C.mint:C.green;ring(s,56,35,22,c,2);ring(s,70,35,22,c,2);txt(s,'фотопринт / контур',106,30,480,34,21,dark?C.dim:C.muted);}
function slide(section,dark,notes){const s=p.slides.add();s.background.fill=dark?C.dark:C.paper;brand(s,dark);txt(s,section,906,31,254,32,18,dark?C.dim:C.muted,false,'right');txt(s,String(p.slides.items.length).padStart(2,'0'),1191,31,35,32,19,dark?C.mint:C.green,true);s.speakerNotes.text=notes;return s;}
function paper(s,label,x,y,w,h,rotation,color){const q=shape(s,'rect',x,y,w,h,C.white,C.line,1,rotation);txt(s,label,x+20,y+14,w-40,42,28,color,true);for(let i=0;i<3;i++)line(s,x+22,y+72+i*17,w-44-i*25,C.line,3);return q;}
function arrow(s,x1,y1,x2,y2,color=C.green,width=3){const l=shape(s,'line',x1,y1,x2-x1,y2-y1,'none',color,width);shape(s,'triangle',x2-8,y2-7,14,14,color,'none',0,90);return l;}

// Crop the real screenshot through the slide image API. Only the rendered,
// content-only PNG is embedded in the final deck, never browser chrome.
const raw=await fs.readFile(path.join(base,'build/redesign/dashboard-raw.png'));
const imageMeta=JSON.parse(await fs.readFile(path.join(base,'build/redesign/dashboard-raw.meta.json'),'utf8'));const sw=imageMeta.width,sh=imageMeta.height;
const region={x:0,y:242,w:sw,h:1134};
const capture=Presentation.create({slideSize:{width:region.w,height:region.h}}),captureSlide=capture.slides.add();
captureSlide.images.add({blob:raw,contentType:imageMeta.format==='JPEG'?'image/jpeg':'image/png',alt:'Реальный интерфейс Фотопринт Контур на демоданных',position:{left:0,top:0,width:region.w,height:region.h},fit:'cover',crop:{left:region.x/sw,top:region.y/sh,right:0,bottom:(sh-region.y-region.h)/sh}});
const clean=await capture.export({slide:captureSlide,format:'png',scale:1});
const cleanPath=path.join(base,'assets/dashboard-clean.png');await fs.writeFile(cleanPath,new Uint8Array(await clean.arrayBuffer()));

// 1 — Problem. An editorial opening with fragmented source documents.
{
 const s=slide('ПРОБЛЕМА',false,'Проблема из ТЗ трека 1: руководителю нужна общая управленческая картина по разрозненным предметным источникам. Ручная сверка, поиск причины и контроль результата не образуют единой цепочки. Не утверждаем измеренное время потерь или денежный эффект. Источник: ТЗ «Единая система управления компанией», §5.1–5.2, README.md.');
 shape(s,'rect',64,358,362,89,C.mint);
 txt(s,'Разрозненные\nданные тормозят\nрешения',64,125,800,333,76,C.ink,true);
 txt(s,'Сверить цифры. Найти причину.\nНазначить действие. Проверить результат.',68,521,720,98,28,C.muted);
 paper(s,'CRM',919,137,218,152,-7,C.green);
 paper(s,'ERP',989,262,218,152,7,C.ink);
 paper(s,'1С',893,390,218,152,-4,C.green);
 circle(s,1085,526,102,C.coral);txt(s,'?',1085,527,102,100,66,C.ink,true,'center');
 txt(s,'Разные системы —\nобщая задача руководителя',867,645,350,52,21,C.muted);
}
// 2 — Solution. A large real product image instead of a feature list.
{
 const s=slide('РЕШЕНИЕ',true,'Фотопринт Контур объединяет показатели, причины отклонений и решения в одном интерфейсе. На слайде реальный скриншот подготовленного стенда, снятый в Chrome. Все бизнес-значения синтетические. Источники: client/app.js, server/api.mjs, SUBMISSION.md.');
 txt(s,'Фотопринт Контур',64,93,1120,92,74,C.white,true);
 txt(s,'Общий дашборд. Понятная причина. Ответственное действие.',68,190,1138,50,29,C.dim);
 shape(s,'roundRect',63,265,1154,432,C.panel,'#54715E',1);
 s.images.add({blob:new Uint8Array(await fs.readFile(cleanPath)),contentType:'image/png',position:{left:72,top:274,width:1136,height:414},fit:'cover',geometry:'roundRect',borderRadius:10,alt:'Работающий общий дашборд с метриками Metabase и Filesystem'});
 txt(s,'Работающий прототип · демоданные',815,235,397,28,17,C.dim,false,'right');
}
// 3 — Advantage: traceability, consistently scoped data.
{
 const s=slide('ПРЕИМУЩЕСТВО 01',false,'Выручка, заказы и брак поступают из работающего Metabase. Остальные показатели используют предметные CSV-источники. У KPI доступны формула, источник, время и согласованный срез. Значение 81 563 BYN — из контрольного демонабора 6–12 ноября 2026, не выручка реальной компании. Источники: server/metabase-query.mjs, server/analytics.mjs, DATA-METHOD.md, submission/verification/dataset.json.');
 txt(s,'У каждой цифры\nесть источник',64,126,750,182,68,C.ink,true);
 txt(s,'Данные из разных систем\nсведены в одну картину.',68,342,500,93,30,C.muted);
 for(const [i,t] of ['Формула расчёта','Общие фильтры','Время обновления'].entries()){line(s,68,470+i*65,430);circle(s,70,494+i*65,8,C.green);txt(s,t,96,481+i*65,405,40,26,C.ink);}
 shape(s,'roundRect',646,285,568,350,C.dark);txt(s,'ОБОРОТ',685,322,478,32,20,C.dim,true);
 txt(s,'81 563',681,365,470,100,82,C.white,true);txt(s,'BYN',1064,410,102,44,28,C.dim,true);
 line(s,686,488,484,'#526C58',1);txt(s,'Источник',686,511,170,36,24,C.dim);txt(s,'Metabase',895,506,265,45,32,C.mint,true);
 txt(s,'Σ revenue выбранного периода',686,566,466,43,24,C.white);
 txt(s,'Контрольный демонабор · 6–12 ноября 2026',653,651,559,30,19,C.muted,false,'right');
}
// 4 — Advantage: an action is followed by a measured result.
{
 const s=slide('ПРЕИМУЩЕСТВО 02',true,'В системе есть связанный цикл: сигнал, причина, решение с владельцем и сроком, действие, повторная проверка и аудит. Закрытие по успешной проверке. Пример 24 при целевом максимуме 30 — результат автоматического приёмочного сценария, использующего явный mock восстановления. Экономический эффект не измерялся. Источники: scripts/acceptance.mjs, submission/verification/acceptance.txt, server/api.mjs.');
 txt(s,'Решение заканчивается\nпроверкой результата',64,110,1160,171,66,C.white,true);
 const xs=[87,390,693,1093];line(s,109,342,1008,'#537258',3);
 const labels=['Сигнал','Причина','Действие','Проверка'];
 const sub=['Что отклонилось','Почему это произошло','Кто делает и к какому сроку','Достигнута ли цель'];
 xs.forEach((x,i)=>{circle(s,x,324,42,i===3?C.mint:C.dark);ring(s,x,324,42,C.mint,2);txt(s,String(i+1),x,325,42,40,21,i===3?C.dark:C.mint,true,'center');txt(s,labels[i],i===3?963:x-22,388,i===3?252:286,48,33,C.white,true,i===3?'right':'left');txt(s,sub[i],i===3?950:x-22,446,i===3?266:276,67,23,C.dim,false,i===3?'right':'left');});
 line(s,64,555,1152,'#537258',1);
 txt(s,'24',65,568,190,112,94,C.mint,true);txt(s,'заказа в очереди\nпосле проверки',251,585,350,74,29,C.white);
 txt(s,'Цель: не более 30',801,580,413,50,34,C.white,true,'right');txt(s,'Демонстрационный результат',764,638,450,35,22,C.dim,false,'right');
}
// 5 — Advantage: role-appropriate responsibility in the same system.
{
 const s=slide('ПРЕИМУЩЕСТВО 03',false,'В приложении семь профилей и три уровня. На слайде обобщены директор, руководитель направления и сотрудник; аналитик имеет отдельный профиль чтения и диагностики. Проверки прав выполняются на сервере, включая прямые API-запросы. Клиенты обращаются к одному серверу; другие устройства в доступной сети не требуют локального Metabase. Источники: server/seed.mjs (ACTORS), auth.mjs, api.mjs, tests/config-api.test.mjs, README.md.');
 txt(s,'Каждому — своя\nзона ответственности',64,110,1152,165,66,C.ink,true);
 const columns=[{x:64,label:'Директор',body:'Вся компания\nи приоритеты',shade:C.green},{x:464,label:'Руководитель',body:'Своё направление\nи отклонения',shade:'#58906D'},{x:864,label:'Сотрудник',body:'Свои задачи\nи результат',shade:'#99B898'}];
 columns.forEach((v,i)=>{if(i)shape(s,'line',v.x-28,331,0,244,'none',C.line,1);circle(s,v.x+6,336,36,v.shade);shape(s,'roundRect',v.x-2,379,52,25,v.shade);txt(s,v.label,v.x,429,350,52,35,C.ink,true);txt(s,v.body,v.x,492,345,82,29,C.muted);});
 shape(s,'rect',64,619,1152,55,C.mint);txt(s,'Права проверяются сервером. Общий интерфейс доступен в браузере.',87,624,1106,42,26,C.ink,true);
}
// 6 — Four equal team profiles, mapped only from user-provided labels.
{
 const mapping=JSON.parse(await fs.readFile(path.join(base,'build/team/photo-map.json'),'utf8'));
 const people=[{key:'vladislav',name:'Владислав\nЛобацевич'},{key:'arseny',name:'Арсений\nЗуевский'},{key:'mark',name:'Марк\nСкоромец'},{key:'timofey',name:'Тимофей\nПотапенко'}];
 if(people.some(v=>!mapping[v.key])||new Set(people.map(v=>mapping[v.key])).size!==4)throw new Error('Four explicit photo assignments are required.');
 const s=slide('КОМАНДА',true,'Все участники — 2 курс механико-математического факультета БГУ: Владислав Лобацевич, Арсений Зуевский, Марк Скоромец, Тимофей Потапенко. Сведения и привязка фотографий предоставлены пользователем. Все участники оформлены одинаково; отдельного блока опыта и выделения нет.');
 txt(s,'Наша команда',64,103,780,99,78,C.white,true);txt(s,'2 курс\nМехмат БГУ',946,113,265,85,29,C.mint,true,'right');
 for(const [i,v] of people.entries()){
  const x=64+i*296;
  s.images.add({blob:new Uint8Array(await fs.readFile(path.join(base,'assets/team',mapping[v.key]))),contentType:'image/png',position:{left:x+12,top:250,width:240,height:240},fit:'cover',geometry:'ellipse',alt:v.name.replace('\n',' ')});
  ring(s,x+11,249,242,'#456450',1);
  txt(s,v.name,x,532,264,92,35,C.white,true,'center');
 }
}

await fs.mkdir(path.join(base,'previews-redesign'),{recursive:true});
const candidate=path.join(base,'build/team/candidate-team-v1.pptx');await (await PresentationFile.exportPptx(p)).save(candidate);
const final=path.join(base,'output/fotoprint-team-v1.pptx');
const validation=await finalizePresentation({workspaceDir:base,candidatePath:candidate,finalPath:final,pythonExecutable:python,integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],requiredNativeTableOwnerSlides:[],explicitTotalSlideCount:6,fontPolicy:{basis:'design',families:[font]},verifyArtifactToolImport:true,receiptPath:path.join(base,'build/team/validation-team-v1.json')});
const imported=await PresentationFile.importPptx(await FileBlob.load(final));
for(const [i,s] of imported.slides.items.entries()){const png=await imported.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(base,'previews-redesign',`slide-${String(i+1).padStart(2,'0')}.png`),new Uint8Array(await png.arrayBuffer()));}
console.log(JSON.stringify({final,slides:6,sha256:validation.finalSha256}));
