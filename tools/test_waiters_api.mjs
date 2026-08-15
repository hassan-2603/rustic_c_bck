import fetch from 'node-fetch';
const urls = ['http://localhost:3000/api/admin/waiters','http://localhost:3001/api/admin/waiters','http://localhost:5000/api/admin/waiters'];
async function test(url, token){
  try{
    const headers = token?{Authorization:`Bearer ${token}`,'x-admin-token':token}:{};
    const res = await fetch(url,{headers});
    const text = await res.text();
    console.log(url,'status',res.status,'body',text.slice(0,1000));
  }catch(e){
    console.log(url,'error',e.message);
  }
}
(async()=>{
  for(const u of urls) await test(u);
  console.log('--- with token ---');
  for(const u of urls) await test(u,'rustic-charm-admin-token');
})();
