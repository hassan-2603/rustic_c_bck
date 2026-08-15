import fetch from 'node-fetch';
const base = 'http://localhost:5000/api/admin';
const endpoints = ['/categories','/menu','/tables','/orders','/waiters','/waiter-calls'];
(async()=>{
  for(const ep of endpoints){
    try{
      const res = await fetch(base+ep,{headers:{Authorization:'Bearer rustic-charm-admin-token','x-admin-token':'rustic-charm-admin-token'}});
      const text = await res.text();
      console.log(ep,'status',res.status,'length',text.length);
    }catch(e){
      console.log(ep,'error',e.message);
    }
  }
})();
