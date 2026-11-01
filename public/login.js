document.querySelector('#login').addEventListener('submit',async event=>{
  event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;
  try{
    const response=await fetch('/api/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:document.querySelector('#password').value,remember:document.querySelector('#remember').checked})});
    document.querySelector('#password').value='';const result=await response.json();if(!response.ok)throw Error(result.error||'Sign-in failed');location.replace('/');
  }catch(error){document.querySelector('#error').textContent=error.message;}finally{button.disabled=false;}
});
