try{
  const response=await fetch('http://127.0.0.1:3000/api/health',{signal:AbortSignal.timeout(3500)});
  const body=await response.json();
  if(!response.ok||body.status!=='ok'||body.mode!=='authenticated')process.exit(1);
}catch{process.exit(1);}
