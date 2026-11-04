import {PDFDocument,StandardFonts,degrees,rgb} from 'pdf-lib';
export async function buildSamplePdf(){
  const d=await PDFDocument.create();d.setTitle('M3 isolated fixture, no user content');
  const font=await d.embedFont(StandardFonts.Helvetica);
  const p=d.addPage([600,800]);
  p.drawRectangle({x:30,y:30,width:220,height:80,color:rgb(0.1,0.5,0.9)});
  p.drawText('MuPDF M3 test: sample 123',{x:30,y:730,size:28,font,color:rgb(0,0,0)});
  const q=d.addPage([500,700]);
  q.drawRectangle({x:90,y:150,width:250,height:300,color:rgb(1,0,0)});
  q.drawText('Crop/Rotate page',{x:115,y:450,size:23,font});
  q.setCropBox(50,100,400,500);
  q.setRotation(degrees(90));
  const bytes=await d.save({useObjectStreams:false});
  return Uint8Array.from(bytes);
}
export function inkSample(){
 return {schemaVersion:3,coordinateSystem:'normalized-0-1',
   objects:[{id:'test-stroke',type:'stroke',widthN:0.005,
     points:[{x:0.1,y:0.2,p:0.5},{x:0.5,y:0.7,p:0.8}]}]};
}
