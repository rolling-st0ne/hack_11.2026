import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Presentation} from '@oai/artifact-tool';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const photos=[
 {file:'IMG_20261112_171003_821.jpg',w:1440,h:2560,x:0,y:973,size:1008},
 {file:'IMG_20261112_171003_950.jpg',w:407,h:603,x:45,y:70,size:320},
 {file:'IMG_20261112_171004_019.jpg',w:720,h:1280,x:40,y:250,size:640},
 {file:'IMG_20261112_171004_302.jpg',w:1080,h:2400,x:280,y:825,size:530}
];
const sheet=Presentation.create({slideSize:{width:1280,height:720}}),s=sheet.slides.add();s.background.fill='#101D17';
for(const [i,a] of photos.entries()){
 const p=Presentation.create({slideSize:{width:600,height:600}}),crop=p.slides.add();
 crop.images.add({blob:new Uint8Array(await fs.readFile('/Users/mark/Downloads/'+a.file)),contentType:'image/jpeg',alt:'Фото участника: '+a.file,position:{left:0,top:0,width:600,height:600},fit:'cover',crop:{left:a.x/a.w,top:a.y/a.h,right:(a.w-a.x-a.size)/a.w,bottom:(a.h-a.y-a.size)/a.h}});
 const png=await p.export({slide:crop,format:'png',scale:1});const data=new Uint8Array(await png.arrayBuffer());
 const filename=a.file.replace('.jpg','.png');await fs.writeFile(path.join(base,'assets/team',filename),data);
 s.images.add({blob:data,contentType:'image/png',position:{left:76+i*296,top:240,width:240,height:240},geometry:'ellipse',fit:'cover',alt:a.file});
 const t=s.shapes.add({geometry:'textbox',position:{left:64+i*296,top:520,width:264,height:70},fill:'none',line:{fill:'none',width:0}});t.text=a.file.slice(-7);t.text.style={typeface:'Arial',fontSize:30,color:'#F9FBF4',alignment:'center'};
}
const png=await sheet.export({slide:s,format:'png',scale:1});await fs.writeFile(path.join(base,'build/team/portraits-review.png'),new Uint8Array(await png.arrayBuffer()));
console.log('Four portrait frames prepared without name assignments.');
