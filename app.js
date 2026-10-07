const cfg=window.ROBOOK_CONFIG||{};
const sb=supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storage:window.localStorage}});
let mode='signup',me=null,profiles=new Map(),activeDM=null;
const ACCOUNT_KEY='roobook-accounts';
// Robook uses a username as the public login identifier. Supabase Auth still
// requires an email-shaped identifier, so we create a private internal address
// that is never shown or sent to the user.
const INTERNAL_DOMAIN='roobook.local';
function authEmail(identifier){
  const clean=(identifier||'').trim().toLowerCase();
  return clean.includes('@') ? clean : `${clean}@${INTERNAL_DOMAIN}`;
}
function accountLabel(identifier){
  const clean=(identifier||'').trim().toLowerCase();
  return clean.endsWith('@'+INTERNAL_DOMAIN) ? clean.slice(0,-('@'+INTERNAL_DOMAIN).length) : clean;
}
function getSavedAccounts(){try{return JSON.parse(localStorage.getItem(ACCOUNT_KEY)||'[]')}catch{return []}}
function rememberAccount(identifier){const clean=accountLabel(identifier);if(!clean)return;const list=getSavedAccounts().filter(x=>x!==clean);list.unshift(clean);localStorage.setItem(ACCOUNT_KEY,JSON.stringify(list.slice(0,8)))}
function removeSavedAccount(identifier){localStorage.setItem(ACCOUNT_KEY,JSON.stringify(getSavedAccounts().filter(x=>x!==identifier)))}
const $=id=>document.getElementById(id);
const toast=x=>{$('toast').textContent=x;$('toast').classList.add('show');setTimeout(()=>$('toast').classList.remove('show'),2200)};
const initials=n=>(n||'R').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
const time=d=>{const n=(Date.now()-new Date(d).getTime())/60000;return n<1?'just now':n<60?Math.floor(n)+'m':n<1440?Math.floor(n/60)+'h':Math.floor(n/1440)+'d'};

function setMode(m){
  mode=m;
  $('authTitle').textContent=m==='signup'?'Create your account':'Welcome back';
  $('authSub').textContent=m==='signup'?'Join Robook and connect with your people.':'Log in with your Robook username.';
  $('nameWrap').classList.toggle('hidden',m!=='signup');
  $('name').required=m==='signup';
  $('confirmPasswordWrap').classList.toggle('hidden',m!=='signup');
  $('confirmPassword').required=m==='signup';
  $('usernameAuth').placeholder=m==='signup'?'Choose a username':'Your username';
  $('authSubmit').textContent=m==='signup'?'Create account':'Log in';
  $('switchText').textContent=m==='signup'?'Already have an account?':'New to Robook?';
  $('switchMode').textContent=m==='signup'?'Log in':'Create account';
  $('authError').textContent='';
}
$('switchMode').onclick=()=>setMode(mode==='signup'?'login':'signup');
$('authForm').onsubmit=async e=>{
  e.preventDefault();
  $('authError').textContent='';
  const identifier=$('usernameAuth').value.trim().toLowerCase();
  const password=$('password').value;
  if(!/^[a-z0-9_]{3,24}$/.test(identifier)){ $('authError').textContent='Username must be 3–24 characters using letters, numbers, or underscores.'; return; }
  if(password.length<6){$('authError').textContent='Password must be at least 6 characters.';return;}
  if(mode==='signup'){
    const display=$('name').value.trim();
    const confirm=$('confirmPassword').value;
    if(password!==confirm){$('authError').textContent='Passwords do not match.';return;}
    const email=authEmail(identifier);
    const {data,error}=await sb.auth.signUp({email,password,options:{data:{display_name:display,username:identifier}}});
    if(error){$('authError').textContent=error.message;return}
    rememberAccount(identifier);
    if(!data.session){
      $('authError').textContent='Account created. If login does not work immediately, turn off Supabase email confirmation for Robook, then log in with your username.';
      setMode('login');
      $('usernameAuth').value=identifier;
      $('password').value='';
      $('confirmPassword').value='';
      return;
    }
  }else{
    const {error}=await sb.auth.signInWithPassword({email:authEmail(identifier),password});
    if(error){$('authError').textContent=error.message;return}
    rememberAccount(identifier);
    renderSavedLoginAccounts();
  }
};

async function boot(){
  applyTheme(localStorage.getItem('roobook-theme')==='dark');
  renderSavedLoginAccounts();
  const {data:{session}}=await sb.auth.getSession();
  if(session){
    me=session.user;
    rememberAccount(session.user.user_metadata?.username || accountLabel(session.user.email));
    await enterApp();
  }else{
    me=null;
    $('app').classList.add('hidden');
    $('authScreen').classList.remove('hidden');
    setMode('login');
    renderSavedLoginAccounts();
  }
  sb.auth.onAuthStateChange(async(event,session)=>{
    if(event==='INITIAL_SESSION') return;
    if(session){
      me=session.user;
      rememberAccount(session.user.user_metadata?.username || accountLabel(session.user.email));
      renderSavedLoginAccounts();
      await enterApp();
    }else{
      me=null;
      $('app').classList.add('hidden');
      $('authScreen').classList.remove('hidden');
      setMode('login');
      renderSavedLoginAccounts();
    }
  });
}
function renderSavedLoginAccounts(){
  const box=$('savedAccounts');
  if(!box)return;
  const accounts=getSavedAccounts();
  box.innerHTML=accounts.length?`<div class="saved-title">Saved accounts</div><div class="saved-account-list">${accounts.map(username=>`<button type="button" class="saved-account" data-login-account="${esc(username)}"><span class="saved-account-avatar">${esc((username[0]||'R').toUpperCase())}</span><span><b>@${esc(username)}</b><small>Log in to this account</small></span><span class="saved-arrow">›</span></button>`).join('')}</div>`:'';
}
$('savedAccounts')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-login-account]');
  if(!b)return;
  setMode('login');
  $('usernameAuth').value=b.dataset.loginAccount;
  $('password').value='';
  $('password').focus();
});

async function getProfile(){const {data,error}=await sb.from('profiles').select('*').eq('id',me.id).single();if(error)return null;return data}
function avatarHtml(p,cls='avatar'){return p?.avatar&&p.avatar.startsWith('http')?`<img class="${cls}" src="${esc(p.avatar)}" alt="">`:`<div class="${cls}">${esc(p?.avatar||initials(p?.display_name))}</div>`}
function updateUser(p){document.querySelectorAll('.current-name').forEach(x=>x.textContent=p.display_name);document.querySelectorAll('.current-handle').forEach(x=>x.textContent='@'+p.username);document.querySelectorAll('.current-avatar').forEach(x=>{x.innerHTML=p.avatar&&p.avatar.startsWith('http')?`<img src="${esc(p.avatar)}" alt="">`:esc(p.avatar||initials(p.display_name))});$('bio').textContent=p.bio||'No bio yet.';profiles.set(p.id,p)}
async function enterApp(){let p=await getProfile();if(!p&&me){const display=(me.user_metadata?.display_name||me.email?.split('@')[0]||'Robook User').slice(0,40);let username=(me.user_metadata?.username||('user_'+me.id.slice(0,8))).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,24);if(username.length<3)username='user_'+me.id.slice(0,8);const created=await sb.from('profiles').insert({id:me.id,username,display_name:display,avatar:initials(display)}).select('*').single();p=created.data||null}if(!p){$('authScreen').classList.remove('hidden');$('app').classList.add('hidden');$('authError').textContent='We could not load your Robook profile. Your account is still safe — try logging in again.';return}updateUser(p);$('authScreen').classList.add('hidden');$('app').classList.remove('hidden');await loadPosts()}

async function loadPosts(search=''){
  let q=sb.from('posts').select('id,user_id,body,image_url,video_url,created_at,profiles!posts_user_id_fkey(id,username,display_name,avatar)').order('created_at',{ascending:false});
  let {data,error}=await q;
  if(error&&String(error.message).includes('image_url')){q=sb.from('posts').select('id,user_id,body,created_at,profiles!posts_user_id_fkey(id,username,display_name,avatar)').order('created_at',{ascending:false});({data,error}=await q)}
  if(error){toast(error.message);return}
  let rows=data||[];
  if(search)rows=rows.filter(p=>(p.body+' '+p.profiles.display_name+' @'+p.profiles.username).toLowerCase().includes(search.toLowerCase()));
  const ids=rows.map(p=>p.id);
  let likes=[],comments=[];
  if(ids.length){
    const lr=await sb.from('post_likes').select('post_id,user_id').in('post_id',ids);likes=lr.data||[];
    const cr=await sb.from('comments').select('id,post_id,user_id,body,created_at,profiles!comments_user_id_fkey(id,username,display_name,avatar)').in('post_id',ids).order('created_at',{ascending:true});comments=cr.data||[];
  }
  renderPosts(rows,likes,comments);
}
function renderPosts(rows,likes,comments){
  const el=$('posts');if(!rows.length){el.innerHTML='<section class="card empty"><div class="round">✦</div><h3>It’s quiet in here… for now.</h3><p>There are no posts yet. Be the first person to share something on Robook.</p><button class="primary" onclick="document.getElementById(\'postText\').focus()">Create the first post</button></section>';return}
  const likeMap=new Map(),commentMap=new Map();likes.forEach(x=>{if(!likeMap.has(x.post_id))likeMap.set(x.post_id,[]);likeMap.get(x.post_id).push(x)});comments.forEach(x=>{if(!commentMap.has(x.post_id))commentMap.set(x.post_id,[]);commentMap.get(x.post_id).push(x)});
  el.innerHTML=rows.map(p=>{const ls=likeMap.get(p.id)||[],cs=commentMap.get(p.id)||[],liked=ls.some(x=>x.user_id===me.id),shown=cs.slice(-3);return `<article class="card post" data-post="${p.id}"><div class="post-head">${avatarHtml(p.profiles)}<div class="post-meta"><b>${esc(p.profiles.display_name)}</b><span>@${esc(p.profiles.username)} · ${time(p.created_at)}</span></div>${p.user_id===me.id?`<button data-delete="${p.id}" class="post-more">•••</button>`:''}</div><p>${esc(p.body)}</p>${p.image_url?`<img class="post-image" src="${esc(p.image_url)}" alt="Post image">`:''}${p.video_url?`<video class="post-video" src="${esc(p.video_url)}" controls playsinline preload="metadata"></video>`:''}<div class="post-actions"><button class="like-btn ${liked?'liked':''}" data-like="${p.id}">❤ <span>${ls.length}</span> Like</button><button data-comment-focus="${p.id}">💬 <span>${cs.length}</span> Comment</button><button type="button" data-share="${p.id}">↗ Share</button></div><div class="comments">${shown.map(c=>`<div class="comment"><div>${avatarHtml(c.profiles,'comment-avatar')}</div><div class="comment-body"><b>${esc(c.profiles.display_name)}</b><span>${esc(c.body)}</span><small>${time(c.created_at)}</small></div></div>`).join('')}<form class="comment-form" data-comment-form="${p.id}"><input name="comment" maxlength="1000" placeholder="Add a comment…" autocomplete="off"><button aria-label="Send comment">➤</button></form></div></article>`}).join('')}

async function uploadImage(file,folder){if(!file)return null;if(!file.type.startsWith('image/'))throw Error('Please choose an image file.');if(file.size>8*1024*1024)throw Error('Images must be under 8MB.');const ext=(file.name.split('.').pop()||'jpg').toLowerCase();const path=`${me.id}/${folder}_${crypto.randomUUID()}.${ext}`;const {error}=await sb.storage.from('roobook-images').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;return sb.storage.from('roobook-images').getPublicUrl(path).data.publicUrl}


async function uploadVideo(file,folder){
  if(!file)return null;
  if(!file.type.startsWith('video/'))throw Error('Please choose a video file.');
  if(file.size>50*1024*1024)throw Error('Videos must be under 50MB.');
  const ext=(file.name.split('.').pop()||'mp4').toLowerCase();
  const path=`${me.id}/${folder}_${crypto.randomUUID()}.${ext}`;
  const {error}=await sb.storage.from('roobook-images').upload(path,file,{upsert:false,contentType:file.type});
  if(error)throw error;
  return sb.storage.from('roobook-images').getPublicUrl(path).data.publicUrl;
}

$('postBtn').onclick=async()=>{const body=$('postText').value.trim(),file=$('postImage').files[0];if(!body&&!file)return toast('Write something or add an image/video first.');try{$('postBtn').disabled=true;$('postBtn').textContent='Posting…';let image_url=null,video_url=null;if(file){if(file.type.startsWith('video/'))video_url=await uploadVideo(file,'post_video');else image_url=await uploadImage(file,'post');}const payload={user_id:me.id,body:body||((video_url)?'🎥':'📷')};if(image_url)payload.image_url=image_url;if(video_url)payload.video_url=video_url;let result=await sb.from('posts').insert(payload);if(result.error&&video_url&&String(result.error.message).includes('video_url')){throw Error('Video support is not enabled in your Supabase database yet. Run the updated schema.sql.')}if(result.error)throw result.error;$('postText').value='';$('postImage').value='';$('postFileName').textContent='Add image or video';await loadPosts();toast('Posted to Robook!')}catch(e){toast(e.message||'Could not create post.')}finally{$('postBtn').disabled=false;$('postBtn').textContent='Post'}};

$('posts').onclick=async e=>{
  const del=e.target.closest('[data-delete]');if(del){if(!confirm('Delete this post?'))return;const {error}=await sb.from('posts').delete().eq('id',del.dataset.delete);if(error)toast(error.message);else loadPosts();return}
  const like=e.target.closest('[data-like]');if(like){const postId=like.dataset.like,already=like.classList.contains('liked');const result=already?await sb.from('post_likes').delete().eq('post_id',postId).eq('user_id',me.id):await sb.from('post_likes').insert({post_id:postId,user_id:me.id});if(result.error)toast(result.error.message);else loadPosts();return}
  const focus=e.target.closest('[data-comment-focus]');if(focus){const input=document.querySelector(`form[data-comment-form="${focus.dataset.commentFocus}"] input`);input?.focus();return}
  const share=e.target.closest('[data-share]');if(share){const url=location.href+'#post-'+share.dataset.share;try{await navigator.clipboard.writeText(url);toast('Post link copied!')}catch{toast('Post ready to share!')}return}
};
$('posts').addEventListener('submit',async e=>{const form=e.target.closest('[data-comment-form]');if(!form)return;e.preventDefault();const input=form.querySelector('input[name="comment"]'),body=input.value.trim();if(!body)return;const {error}=await sb.from('comments').insert({post_id:form.dataset.commentForm,user_id:me.id,body});if(error)toast(error.message);else{input.value='';await loadPosts()}});
$('search').oninput=e=>loadPosts(e.target.value);

async function openProfile(){const p=await getProfile();if(p){updateUser(p);const {count}=await sb.from('posts').select('id',{count:'exact',head:true}).eq('user_id',me.id);$('postStat').textContent=`${count||0} post${count===1?'':'s'}`;$('profileModal').classList.remove('hidden')}}
async function openEdit(){const p=await getProfile();if(!p)return;$('editName').value=p.display_name;$('editUsername').value=p.username;$('editBio').value=p.bio||'';$('avatarFileName').textContent=p.avatar&&p.avatar.startsWith('http')?'Change current picture':'Choose an image';$('editProfile').classList.remove('hidden')}
$('profileTop').onclick=openProfile;$('profileSide').onclick=openProfile;$('editSide').onclick=openEdit;$('editRight').onclick=openEdit;$('editModal').onclick=()=>{$('profileModal').classList.add('hidden');openEdit()};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('.modal').classList.add('hidden'));
$('avatarFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;$('avatarFileName').textContent=file.name;try{$('avatarFileName').textContent='Uploading…';const url=await uploadImage(file,'avatar');const {error}=await sb.from('profiles').update({avatar:url}).eq('id',me.id);if(error)throw error;const p=await getProfile();updateUser(p);await loadPosts();$('avatarFileName').textContent='Profile picture updated';toast('Profile picture updated!')}catch(e){$('avatarFileName').textContent='Upload failed — choose another image';toast(e.message||'Could not upload profile picture.')}e.target.value=''};
$('editForm').onsubmit=async e=>{e.preventDefault();$('editError').textContent='';const {error}=await sb.from('profiles').update({display_name:$('editName').value.trim(),username:$('editUsername').value.trim().toLowerCase(),bio:$('editBio').value.trim()}).eq('id',me.id);if(error){$('editError').textContent=error.message;return}$('editProfile').classList.add('hidden');const p=await getProfile();updateUser(p);await loadPosts();toast('Profile updated!')};

$('friendsSide').onclick=openFriends;async function openFriends(){await loadPeople();$('friendsModal').classList.remove('hidden')}
async function loadPeople(){const term=$('peopleSearch').value.trim().toLowerCase();let {data,error}=await sb.from('profiles').select('id,username,display_name,avatar').neq('id',me.id).order('display_name');if(error)return toast(error.message);if(term)data=(data||[]).filter(p=>(p.display_name+' '+p.username).toLowerCase().includes(term));const {data:f}=await sb.from('follows').select('following_id').eq('follower_id',me.id);const set=new Set((f||[]).map(x=>x.following_id));$('peopleList').innerHTML=(data||[]).map(p=>`<div class="person">${avatarHtml(p)}<div class="person-info"><b>${esc(p.display_name)}</b><span>@${esc(p.username)}</span></div><button class="follow-btn ${set.has(p.id)?'following':''}" data-follow="${p.id}" data-following="${set.has(p.id)}">${set.has(p.id)?'Following':'Add friend'}</button><button class="message-person" data-message-person="${p.id}">Message</button></div>`).join('')||'<p class="muted">No users found.</p>'}
$('postImage').onchange=e=>{$('postFileName').textContent=e.target.files[0]?e.target.files[0].name:'Add image'};$('peopleSearch').oninput=loadPeople;$('peopleList').onclick=async e=>{const msg=e.target.closest('[data-message-person]');if(msg){$('friendsModal').classList.add('hidden');await openMessages(msg.dataset.messagePerson);return}const b=e.target.closest('[data-follow]');if(!b)return;const id=b.dataset.follow,following=b.dataset.following==='true';const result=following?await sb.from('follows').delete().eq('follower_id',me.id).eq('following_id',id):await sb.from('follows').insert({follower_id:me.id,following_id:id});if(result.error)return toast(result.error.message);await loadPeople()};

// Direct messages
async function openMessages(personId=null){await loadDMPeople();$('messagesModal').classList.remove('hidden');if(personId)selectDM(personId)}
async function loadDMPeople(){const term=$('dmSearch').value.trim().toLowerCase();let {data,error}=await sb.from('profiles').select('id,username,display_name,avatar').neq('id',me.id).order('display_name');if(error)return toast(error.message);if(term)data=(data||[]).filter(p=>(p.display_name+' '+p.username).toLowerCase().includes(term));$('dmPeople').innerHTML=(data||[]).map(p=>`<button class="dm-person ${activeDM===p.id?'selected':''}" data-dm-person="${p.id}">${avatarHtml(p)}<span><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></span></button>`).join('')||'<p class="muted">No people found.</p>';(data||[]).forEach(p=>profiles.set(p.id,p))}
async function selectDM(id){activeDM=id;const p=profiles.get(id);if(p){$('dmHeader').innerHTML=`${avatarHtml(p)}<div><b>${esc(p.display_name)}</b><small>@${esc(p.username)}</small></div>`;$('dmText').disabled=false;$('dmForm').querySelector('button').disabled=false}await loadDMPeople();await loadDMMessages()}
async function loadDMMessages(){if(!activeDM)return;const {data,error}=await sb.from('messages').select('id,sender_id,recipient_id,body,created_at').or(`and(sender_id.eq.${me.id},recipient_id.eq.${activeDM}),and(sender_id.eq.${activeDM},recipient_id.eq.${me.id})`).order('created_at',{ascending:true});if(error){toast(error.message);return}const rows=data||[];$('dmMessages').innerHTML=rows.length?rows.map(m=>`<div class="dm-row ${m.sender_id===me.id?'mine':''}"><div class="bubble">${esc(m.body)}<small>${time(m.created_at)}</small></div></div>`).join(''):'<div class="dm-empty">No messages yet. Say hello.</div>';$('dmMessages').scrollTop=$('dmMessages').scrollHeight}
$('dmForm').onsubmit=async e=>{e.preventDefault();if(!activeDM)return;const input=$('dmText'),body=input.value.trim();if(!body)return;const btn=e.submitter||$('dmForm').querySelector('button');btn.disabled=true;const {error}=await sb.from('messages').insert({sender_id:me.id,recipient_id:activeDM,body});if(error)toast(error.message);else{input.value='';await loadDMMessages()}btn.disabled=false;input.focus()};
$('dmSearch').oninput=loadDMPeople;$('dmPeople').onclick=e=>{const b=e.target.closest('[data-dm-person]');if(b)selectDM(b.dataset.dmPerson)};$('messagesSide').onclick=()=>openMessages();$('messagesTop').onclick=()=>openMessages();

// Account switcher
function renderAccounts(){
  const list=$('accountList');
  const accounts=getSavedAccounts();
  list.innerHTML=accounts.length?accounts.map(email=>`<div class="account-row"><div class="account-avatar">${esc((email[0]||'R').toUpperCase())}</div><div class="account-info"><b>${esc(email)}</b><span>${me?.email?.toLowerCase()===email?'Current account':'Saved account'}</span></div><button class="account-switch" data-account="${esc(email)}" ${me?.email?.toLowerCase()===email?'disabled':''}>${me?.email?.toLowerCase()===email?'Current':'Switch'}</button><button class="account-remove" data-remove-account="${esc(email)}" aria-label="Remove saved account">×</button></div>`).join(''):'<p class="muted">No saved accounts yet.</p>';
}
function openAccounts(){renderAccounts();$('accountsModal').classList.remove('hidden')}
$('accountsSide').onclick=openAccounts;
$('accountList').onclick=async e=>{
  const remove=e.target.closest('[data-remove-account]');
  if(remove){removeSavedAccount(remove.dataset.removeAccount);renderAccounts();toast('Account removed from this device.');return}
  const button=e.target.closest('[data-account]');
  if(!button)return;
  const username=button.dataset.account;
  const password=prompt(`Enter the password for @${username}`);
  if(password===null)return;
  button.disabled=true;button.textContent='Switching…';
  const {error}=await sb.auth.signInWithPassword({email:authEmail(username),password});
  if(error){button.disabled=false;button.textContent='Switch';toast(error.message);return}
  rememberAccount(username);$('accountsModal').classList.add('hidden');toast(`Switched to @${username}`);
};
$('addAccountBtn').onclick=async()=>{await sb.auth.signOut();$('accountsModal').classList.add('hidden');setMode('signup');$('authForm').reset();$('authScreen').classList.remove('hidden');$('app').classList.add('hidden');renderSavedLoginAccounts();$('name').focus();toast('Create your new Robook account.')};

// Theme
function applyTheme(dark){document.body.classList.toggle('dark',dark);localStorage.setItem('roobook-theme',dark?'dark':'light');$('themeSide').textContent=dark?'☀️ Light mode':'🌙 Dark mode';$('themeTop').textContent=dark?'☀️':'☾';$('themeSwitch').textContent=dark?'☀️':'☾'}
function toggleTheme(){applyTheme(!document.body.classList.contains('dark'));toast(document.body.classList.contains('dark')?'Dark mode on':'Light mode on')}
$('themeSide').onclick=toggleTheme;$('themeTop').onclick=toggleTheme;$('themeSwitch').onclick=toggleTheme;
$('logout').onclick=async()=>{await sb.auth.signOut();toast('Logged out.')};
boot();
