import { refreshSession } from './auth.js';

export const SB_URL="https://rkcidwusjzvfwxszotnb.supabase.co";
export const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrY2lkd3Vzanp2Znd4c3pvdG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDU4NzIsImV4cCI6MjA5MDE4MTg3Mn0.N-frD06x0MzSg8dHmz-xneA16QvVrBmAYUg3ileNpXw";

// Czyta access_token zalogowanego użytkownika z localStorage (zapisywany przez lib/auth.js).
// Zwraca null jeśli brak sesji → sbFetch używa wtedy anon key (zachowanie pre-tenant).
function getUserToken(){
  try{
    var raw=localStorage.getItem("sb_session");
    if(!raw)return null;
    var s=JSON.parse(raw);
    return s&&s.access_token?s.access_token:null;
  }catch(e){return null;}
}

function sbFetchRaw(method, path, body, tokenOverride){
  var userTok=tokenOverride!==undefined?tokenOverride:getUserToken();
  return fetch(SB_URL+"/rest/v1/"+path, {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer "+(userTok||SB_KEY),
      "Content-Type": "application/json",
      "Prefer": method==="POST"?"return=representation":"return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r){
    if(!r.ok) return r.text().then(function(t){var err=new Error(t);err.status=r.status;throw err;});
    var ct=r.headers.get("content-type")||"";
    if(ct.includes("json")) return r.json();
    return null;
  });
}

// Wrapper z auto-odswiezeniem JWT: jesli Supabase zwroci PGRST303 (JWT expired),
// odswiez sesje przez refresh_token i powtorz zapytanie raz z nowym tokenem.
// Jesli refresh_token tez wygasl (odswiezenie sie nie uda), czyscimy martwa
// sesje i przeladowujemy strone - main.jsx pokaze wtedy ekran logowania
// zamiast zostawiac surowy blad "JWT expired" w UI.
function sbFetch(method, path, body){
  return sbFetchRaw(method, path, body).catch(function(e){
    if(e.message&&e.message.indexOf("PGRST303")!==-1){
      return refreshSession().then(function(s){
        if(!s||!s.access_token){
          localStorage.removeItem("sb_session");
          window.location.reload();
          throw e;
        }
        return sbFetchRaw(method, path, body, s.access_token);
      });
    }
    throw e;
  });
}

export const sbApi = {
  // Pobierz wszystkich klient\u00f3w
  getClients: function(){
    return sbFetch("GET","clients?select=*&order=id.desc");
  },
  // Dodaj nowego klienta
  addClient: function(name, addr, phone, email, postal, city){
    return sbFetch("POST","clients",{name:name,addr:addr,phone:phone||"",email:email||"",postal:postal||"",city:city||"",rooms:[{id:1,name:"Salon",img:IMG_ROOM_SALON,windows:[]}]});
  },
  addClientFull: function(data){
    return sbFetch("POST","clients",data);
  },
  // Zaktualizuj rooms klienta (zapisuje ca\u0142y JSON)
  updateClient: function(id, data){
    return sbFetch("PATCH","clients?id=eq."+id, data);
  },
  // Usu\u0144 klienta
  deleteClient: function(id){
    return sbFetch("DELETE","clients?id=eq."+id);
  },
  updateClientStatus: function(id,status){
    return sbFetch("PATCH","clients?id=eq."+id,{status:status});
  },
  // \u2500\u2500 KONTRAHENCI (baza klient\u00f3w i dostawc\u00f3w) \u2500\u2500
  getContacts: function(){
    return sbFetch("GET","contacts?select=*&order=name.asc");
  },
  addContact: function(data){
    return sbFetch("POST","contacts",data);
  },
  updateContact: function(id,data){
    return sbFetch("PATCH","contacts?id=eq."+id,data);
  },
  deleteContact: function(id){
    return sbFetch("DELETE","contacts?id=eq."+id);
  },
  // Faktury danego kontrahenta (Faza 3 \u2014 karta z histori\u0105)
  getContactInvoices: function(contactId){
    return sbFetch("GET","invoices?contact_id=eq."+contactId+"&select=*&order=created_at.desc");
  },
  // Wyceny (clients) danego kontrahenta
  getContactQuotes: function(contactId){
    return sbFetch("GET","clients?contact_id=eq."+contactId+"&select=id,name,status,created_at&order=id.desc");
  },
  // \u2500\u2500 DEALS (CRM) \u2500\u2500
  getDeals: function(){
    return sbFetch("GET","deals?select=*&order=created_at.asc");
  },
  addDeal: function(clientId){
    return sbFetch("POST","deals",{client_id:clientId,stage:"zapytanie",notes:"",visit_date:null,delivery_date:null,followup_date:null,acquisition:null});
  },
  updateDeal: function(id,data){
    return sbFetch("PATCH","deals?id=eq."+id,data);
  },
  deleteDeal: function(id){
    return sbFetch("DELETE","deals?id=eq."+id);
  },
  getAttachments: function(dealId){
    return sbFetch("GET","deal_attachments?deal_id=eq."+dealId+"&select=*&order=created_at.asc");
  },
  addAttachment: function(dealId,url,name){
    return sbFetch("POST","deal_attachments",{deal_id:dealId,url:url,name:name||""});
  },
  deleteAttachment: function(id){
    return sbFetch("DELETE","deal_attachments?id=eq."+id);
  },
  // \u2500\u2500 USER SETTINGS (mail) \u2500\u2500
  // Per-user ustawienia modu\u0142u Mail (podpis HTML, URL obrazka stopki)
  getUserSettings: function(email){
    if(!email)return Promise.resolve(null);
    return sbFetch("GET","user_settings?user_email=eq."+encodeURIComponent(email)+"&select=*").then(function(rows){
      return (rows&&rows[0])||null;
    });
  },
  upsertUserSettings: function(email, data){
    if(!email)return Promise.reject(new Error("Brak email"));
    // Sprawd\u017a czy rekord ju\u017c istnieje, potem PATCH lub POST
    return sbFetch("GET","user_settings?user_email=eq."+encodeURIComponent(email)+"&select=id")
      .then(function(rows){
        var exists=rows&&rows.length>0;
        if(exists){
          // Rekord istnieje \u2014 aktualizuj przez PATCH
          return sbFetch("PATCH","user_settings?user_email=eq."+encodeURIComponent(email),data);
        } else {
          // Brak rekordu \u2014 wstaw nowy przez POST
          return sbFetch("POST","user_settings",Object.assign({user_email:email},data));
        }
      });
  },
  // Upload obrazka podpisu do bucket mail-signatures
  // Zwraca publiczny URL gotowy do wstawienia w <img src="...">
  uploadSignatureImage: function(email, file){
    if(!file)return Promise.reject(new Error("Brak pliku"));
    var safeEmail=(email||"unknown").replace(/[^a-zA-Z0-9._-]/g,"_");
    var ext=(file.name.split(".").pop()||"png").toLowerCase();
    var path=safeEmail+"/signature_"+Date.now()+"."+ext;
    return fetch(SB_URL+"/storage/v1/object/mail-signatures/"+path, {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer "+SB_KEY,
        "Content-Type": file.type||"application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){throw new Error("Upload failed: "+t);});
      return SB_URL+"/storage/v1/object/public/mail-signatures/"+path;
    });
  },
  // Usuwa obrazek podpisu z bucketu (best-effort, b\u0142\u0105d nie blokuje)
  deleteSignatureImage: function(url){
    if(!url)return Promise.resolve();
    var marker="/mail-signatures/";
    var idx=url.indexOf(marker);
    if(idx<0)return Promise.resolve();
    var path=url.substring(idx+marker.length);
    return fetch(SB_URL+"/storage/v1/object/mail-signatures/"+path, {
      method: "DELETE",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer "+SB_KEY
      }
    }).then(function(){return true;}).catch(function(){return false;});
  },
  // \u2500\u2500 MAIL TEMPLATES (szablony maili) \u2500\u2500
  // Pobierz wszystkie szablony posortowane po sort_order
  getMailTemplates: function(){
    return sbFetch("GET","mail_templates?select=*&order=sort_order.asc");
  },
  // Dodaj nowy szablon. Je\u015bli data.template_id nie podany, generuje slug z label+timestamp
  addMailTemplate: function(data){
    var payload=Object.assign({},data||{});
    if(!payload.template_id){
      var base=(payload.label||"szablon").toLowerCase()
        .replace(/\u0105/g,"a").replace(/\u0107/g,"c").replace(/\u0119/g,"e")
        .replace(/\u0142/g,"l").replace(/\u0144/g,"n").replace(/\u00f3/g,"o")
        .replace(/\u015b/g,"s").replace(/\u017a/g,"z").replace(/\u017c/g,"z")
        .replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"").substring(0,40)||"szablon";
      payload.template_id=base+"_"+Date.now();
    }
    return sbFetch("POST","mail_templates",payload);
  },
  // Aktualizuj szablon po template_id (nie po liczbowym id)
  updateMailTemplate: function(templateId, data){
    if(!templateId)return Promise.reject(new Error("Brak template_id"));
    return sbFetch("PATCH","mail_templates?template_id=eq."+encodeURIComponent(templateId),data);
  },
  // Usu\u0144 szablon po template_id
  deleteMailTemplate: function(templateId){
    if(!templateId)return Promise.reject(new Error("Brak template_id"));
    return sbFetch("DELETE","mail_templates?template_id=eq."+encodeURIComponent(templateId));
  },
  // Upload pliku za\u0142\u0105cznika sta\u0142ego szablonu maila do bucket mail-template-files
  // Zwraca obiekt {url, name, size, type} gotowy do zapisania w template_files
  uploadTemplateFile: function(templateId, file){
    if(!file)return Promise.reject(new Error("Brak pliku"));
    var safeId=String(templateId||"unknown").replace(/[^a-zA-Z0-9._-]/g,"_");
    var safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
    var path=safeId+"/"+Date.now()+"_"+safeName;
    return fetch(SB_URL+"/storage/v1/object/mail-template-files/"+path, {
      method: "POST",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer "+SB_KEY,
        "Content-Type": file.type||"application/octet-stream",
        "x-upsert": "true"
      },
      body: file
    }).then(function(r){
      if(!r.ok) return r.text().then(function(t){throw new Error("Upload failed: "+t);});
      return {
        url: SB_URL+"/storage/v1/object/public/mail-template-files/"+path,
        name: file.name,
        size: file.size,
        type: file.type||""
      };
    });
  },
  // Usuwa plik za\u0142\u0105cznika z bucketu mail-template-files (best-effort)
  deleteTemplateFile: function(url){
    if(!url)return Promise.resolve();
    var marker="/mail-template-files/";
    var idx=url.indexOf(marker);
    if(idx<0)return Promise.resolve();
    var path=url.substring(idx+marker.length);
    return fetch(SB_URL+"/storage/v1/object/mail-template-files/"+path, {
      method: "DELETE",
      headers: {
        "apikey": SB_KEY,
        "Authorization": "Bearer "+SB_KEY
      }
    }).then(function(){return true;}).catch(function(){return false;});
  },
  // Pobierz config (branding) wlasnego tenanta - RLS policy own_tenant pozwala
  // userowi czytac tylko swoj rekord z tabeli tenants.
  getMyTenant: function(){
    return sbFetch("GET","tenants?select=id,name,config,trial_ends_at,subscription_status,plan,is_demo&limit=1").then(function(rows){
      var t=rows&&rows[0]?rows[0]:null;
      // Flaga trybu demo - czytana przez guardy (KSeF, mail) w tym module
      try{if(typeof window!=="undefined")window.PD_IS_DEMO=!!(t&&t.is_demo);}catch(e){}
      return t;
    });
  },

  // \u2500\u2500 FAKTURY (modul Faktury \u2014 multi-tenant, JDG/VAT) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // Ustawienia fakturowania tenanta (1 wiersz). Zwraca obiekt lub null.
  getInvoiceSettings: function(){
    return sbFetch("GET","invoice_settings?select=*&limit=1").then(function(rows){
      return (rows&&rows[0])||null;
    });
  },
  // Upsert ustawien. tenant_id ustawia DEFAULT z JWT przy INSERT.
  saveInvoiceSettings: function(data){
    return sbFetch("GET","invoice_settings?select=tenant_id&limit=1").then(function(rows){
      var patch=Object.assign({},data,{updated_at:new Date().toISOString()});
      if(rows&&rows.length>0){
        return sbFetch("PATCH","invoice_settings?tenant_id=eq."+rows[0].tenant_id,patch);
      }
      return sbFetch("POST","invoice_settings",patch);
    });
  },
  // ── PODMIOTY (multi-podmiot: wiele dzialalnosci w jednym tenancie) ──────────
  // Lista podmiotow tenanta (domyslny pierwszy).
  getEntities: function(){
    return sbFetch("GET","entities?select=*&order=is_default.desc,sort_order.asc,created_at.asc");
  },
  // Utworz nowy podmiot. tenant_id z DEFAULT (JWT). Zwraca utworzony rekord.
  createEntity: function(data){
    return sbFetch("POST","entities",Object.assign({},data)).then(function(rows){
      return Array.isArray(rows)?rows[0]:rows;
    });
  },
  // Zapisz zmiany podmiotu.
  saveEntity: function(id,data){
    var patch=Object.assign({},data,{updated_at:new Date().toISOString()});
    delete patch.id; delete patch.tenant_id; delete patch.created_at;
    return sbFetch("PATCH","entities?id=eq."+id,patch);
  },
  deleteEntity: function(id){
    return sbFetch("DELETE","entities?id=eq."+id);
  },

  // Lista faktur (naglowki), najnowsze pierwsze wg daty wystawienia.
  // (created_at sortowalo wg momentu zapisu do bazy - przy synchronizacji z KSeF
  // kolejnosc zapisu nie pokrywa sie z chronologia faktur, co myliło uzytkownika)
  getInvoices: function(){
    return sbFetch("GET","invoices?select=*&order=issue_date.desc.nullslast,created_at.desc");
  },
  // Pojedyncza faktura wraz z pozycjami (PostgREST embed).
  getInvoice: function(id){
    return sbFetch("GET","invoices?id=eq."+id+"&select=*,invoice_items(*)").then(function(rows){
      return (rows&&rows[0])||null;
    });
  },
  // Tworzy naglowek faktury (domyslnie status draft). Zwraca utworzony rekord.
  addInvoice: function(data){
    return sbFetch("POST","invoices",data).then(function(rows){
      return Array.isArray(rows)?rows[0]:rows;
    });
  },
  updateInvoice: function(id,data){
    var patch=Object.assign({},data,{updated_at:new Date().toISOString()});
    return sbFetch("PATCH","invoices?id=eq."+id,patch);
  },
  deleteInvoice: function(id){
    return sbFetch("DELETE","invoices?id=eq."+id);
  },
  // \u2500\u2500 Pozycje faktury \u2500\u2500
  getInvoiceItems: function(invoiceId){
    return sbFetch("GET","invoice_items?invoice_id=eq."+invoiceId+"&select=*&order=position.asc");
  },
  // Zastepuje wszystkie pozycje faktury nowym zestawem (wstrzykuje invoice_id).
  replaceInvoiceItems: function(invoiceId, items){
    return sbFetch("DELETE","invoice_items?invoice_id=eq."+invoiceId).then(function(){
      if(!items||!items.length)return [];
      return sbFetch("POST","invoice_items",items.map(function(it){
        return Object.assign({},it,{invoice_id:invoiceId});
      }));
    });
  },
  // Atomowe nadanie kolejnego numeru (RPC, bez wyscigow). Zwraca int.
  // entityId (opcjonalny): osobna numeracja per podmiot. Gdy null -> podmiot domyslny.
  nextInvoiceNumber: function(docType, period, entityId){
    if(entityId){
      return sbFetch("POST","rpc/next_invoice_number",{p_entity_id:entityId,p_doc_type:docType,p_period:period});
    }
    return sbFetch("POST","rpc/next_invoice_number",{p_doc_type:docType,p_period:period});
  },
  // Dekrementuje licznik przy wycofaniu faktury (usuwa wiersz gdy last_number <= 1)
  // entityId (opcjonalny): licznik jest per podmiot.
  decrementInvoiceCounter: function(docType, period, entityId){
    var enc=encodeURIComponent;
    var filt="doc_type=eq."+enc(docType)+"&period=eq."+enc(period)+(entityId?("&entity_id=eq."+enc(entityId)):"");
    return sbFetch("GET","invoice_counters?"+filt+"&select=last_number")
      .then(function(rows){
        var cur=rows&&rows[0]&&rows[0].last_number;
        if(!cur||cur<=0) return;
        if(cur<=1){
          return sbFetch("DELETE","invoice_counters?"+filt);
        }
        return sbFetch("PATCH","invoice_counters?"+filt,{last_number:cur-1});
      });
  },

  // Magazyn
  getWarehouseItems: function(){
    return sbFetch("GET","warehouse_items?select=*&order=category.asc,name.asc");
  },
  addWarehouseItem: function(data){
    return sbFetch("POST","warehouse_items",Object.assign({},data,{created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
  },
  updateWarehouseItem: function(id,data){
    return sbFetch("PATCH","warehouse_items?id=eq."+id,Object.assign({},data,{updated_at:new Date().toISOString()}));
  },
  deleteWarehouseItem: function(id){
    return sbFetch("DELETE","warehouse_items?id=eq."+id);
  },

  // Katalog produktow (nadpisania + produkty wlasne)
  getCatalogItems: function(){
    return sbFetch("GET","catalog_items?select=*");
  },
  addCatalogItem: function(data){
    return sbFetch("POST","catalog_items",Object.assign({},data,{created_at:new Date().toISOString(),updated_at:new Date().toISOString()}));
  },
  updateCatalogItem: function(id,data){
    return sbFetch("PATCH","catalog_items?id=eq."+id,Object.assign({},data,{updated_at:new Date().toISOString()}));
  },
  deleteCatalogItem: function(id){
    return sbFetch("DELETE","catalog_items?id=eq."+id);
  },

  // Szyny KS - scinki
  getRailScraps: function(){
    return sbFetch("GET","rail_scraps?select=*&order=length_cm.desc").then(function(rows){
      return (rows||[]).map(function(r){
        return Object.assign({},r,{rail_type: r.rail_type==="Szyna KS"?"KS":r.rail_type});
      });
    });
  },
  addRailScrap: function(data){
    return sbFetch("POST","rail_scraps",Object.assign({},data,{created_at:new Date().toISOString()}));
  },
  // Dodaje wiele sztuk naraz (np. kilka odcinków tej samej długości) — jeden POST z tablicą wierszy.
  addRailScraps: function(dataArr){
    var now=new Date().toISOString();
    return sbFetch("POST","rail_scraps",(dataArr||[]).map(function(d){return Object.assign({},d,{created_at:now});}));
  },
  deleteRailScrap: function(id){
    return sbFetch("DELETE","rail_scraps?id=eq."+id);
  },
  // ── MAIL RECIPIENTS HISTORY (historia adresów odbiorców) ──
  // Pobiera zapisane adresy pasujące do query (dla podpowiedzi w polu Do:)
  searchMailRecipients: function(query){
    if(!query)return Promise.resolve([]);
    var q=query.toLowerCase().replace(/[%_]/g,"");
    // Dwa osobne zapytania: po email i po nazwie, łączymy po stronie klienta
    var byEmail=sbFetch("GET","mail_recipients?email_lower=ilike.*"+encodeURIComponent(q)+"*&order=last_used_at.desc&limit=8");
    var byName=sbFetch("GET","mail_recipients?name=ilike.*"+encodeURIComponent(q)+"*&order=last_used_at.desc&limit=8");
    return Promise.all([byEmail,byName]).then(function(results){
      var seen={}, merged=[];
      (results[0]||[]).concat(results[1]||[]).forEach(function(r){
        if(r&&r.email_lower&&!seen[r.email_lower]){seen[r.email_lower]=1;merged.push(r);}
      });
      return merged.slice(0,8);
    }).catch(function(){return [];});
  },
  // Zapisuje/aktualizuje adres odbiorcy po wysłaniu maila (upsert po email_lower)
  upsertMailRecipient: function(email, name){
    if(!email)return Promise.resolve();
    var emailLower=email.toLowerCase().trim();
    var userTok=getUserToken();
    return fetch(SB_URL+"/rest/v1/mail_recipients",{
      method:"POST",
      headers:{
        "apikey":SB_KEY,
        "Authorization":"Bearer "+(userTok||SB_KEY),
        "Content-Type":"application/json",
        "Prefer":"resolution=merge-duplicates,return=minimal"
      },
      body:JSON.stringify({email:email.trim(),email_lower:emailLower,name:name||"",last_used_at:new Date().toISOString()})
    }).catch(function(){return null;});
  }
};

// \u2500\u2500 SUPABASE STORAGE IMAGES \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
var SB_STORAGE = SB_URL + "/storage/v1/object/public/assets/porter-design-assets/";

function imgUrl(path) {
  return SB_STORAGE + path + "?v=2";
}

// Logo
var LOGO_SRC          = imgUrl("logo.png");

// Pokoje
var IMG_ROOM_SALON    = imgUrl("rooms/salon.jpg");
var IMG_ROOM_KUCHNIA  = imgUrl("rooms/kuchnia.jpg");
var IMG_ROOM_SYPIALNIA= imgUrl("rooms/sypialnia.jpg");
var IMG_ROOM_POK\u00d3J    = imgUrl("rooms/pokoj.jpg");
var IMG_ROOM_GABINET  = imgUrl("rooms/gabinet.jpg");
var IMG_OKNO          = imgUrl("rooms/okno.jpg");

// \u017baluzje
var IMG_JZ_ALUMINIUM  = imgUrl("zaluzje/aluminium.jpg");
var IMG_JZ_BAMBOO     = imgUrl("zaluzje/bamboo.jpg");
var IMG_JZ_BASSWOOD   = imgUrl("zaluzje/basswood.jpg");

// Rolety
var IMG_ROLETA_RELAX              = imgUrl("rolety/relax.jpg");
var IMG_ROLETA_PRINT              = imgUrl("rolety/print.jpg");
var IMG_ROLETA_BACK               = imgUrl("rolety/back.jpg");
var IMG_ROLETA_PODSZEWKA          = imgUrl("rolety/podszewka.jpg");
var IMG_ROLETA_DUO                = imgUrl("rolety/duo.jpg");
var IMG_ROLETA_FRONT              = imgUrl("rolety/front.jpg");
var IMG_ROLETA_CASCADE            = imgUrl("rolety/cascade.jpg");
var IMG_ROLETA_LANCUSZEK_BIALY    = imgUrl("rolety/lancuszek-bialy.jpg");
var IMG_ROLETA_LANCUSZEK_METALOWY = imgUrl("rolety/lancuszek-metalowy.jpg");

// Zas\u0142ony / fa\u0142dy
var IMG_FALDA_POJEDYNCZA = imgUrl("zasony/falda-pojedyncza.jpg");
var IMG_FALDA_PODWOJNA   = imgUrl("zasony/falda-podwojna.jpg");
var IMG_FALDA_POTROJNA   = imgUrl("zasony/falda-potrojna.jpg");
var IMG_FALDA_PLASKA     = imgUrl("zasony/falda-plaska.jpg");
var IMG_FALDA_STUDIO     = imgUrl("zasony/falda-studio.jpg?v=3");
var IMG_MODEL_TASMA      = imgUrl("zasony/model-tasma.jpg");
var IMG_MODEL_WAVE       = imgUrl("zasony/model-wave.jpg");
var IMG_MODEL_FALDA      = imgUrl("zasony/model-falda.jpg");

// ── ADMIN API (super-admin only, calls /api/admin/* on backend) ──────────
// Backend weryfikuje JWT + is_super_admin, dopiero potem uzywa service_role key
// do operacji privileged (tworzenie tenantow, userow, ban/unban).
function adminFetch(method, path, body){
  var userTok=getUserToken();
  return fetch(path, {
    method: method,
    headers: {
      "Authorization": "Bearer "+(userTok||""),
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r){
    return r.text().then(function(t){
      if(!r.ok){
        var msg=t;
        try{var j=JSON.parse(t);msg=j.error||j.message||t;}catch(e){}
        throw new Error(msg||("HTTP "+r.status));
      }
      return t ? JSON.parse(t) : null;
    });
  });
}

// ── KSeF API (wywołuje Edge Functions api/ksef/*) ─────────────────────────
// Front przekazuje swój JWT — backend weryfikuje, odszyfruje token KSeF i woła MF API.
function ksefFetchRaw(method, path, body, tokenOverride) {
  var userTok = tokenOverride !== undefined ? tokenOverride : getUserToken();
  // Mapuj /api/ksef/X → Supabase Edge Function ksef-X
  // (Deno runtime: pełne biblioteki krypto + dostęp do sieci, bez ograniczeń Vercel Hobby)
  var url = path;
  var m = path.match(/^\/api\/ksef\/(.+)$/);
  if (m) url = SB_URL + "/functions/v1/ksef-" + m[1];
  return fetch(url, {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer " + (userTok || SB_KEY),
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r) {
    return r.text().then(function(t) {
      var data;
      try { data = JSON.parse(t); } catch(e) { data = { error: t }; }
      if (!r.ok) throw Object.assign(new Error(data.error || ("HTTP " + r.status)), { detail: data.detail, status: r.status });
      return data;
    });
  });
}

// Wrapper z auto-refresh JWT: jeśli Edge Function zwróci 401/invalid jwt,
// odśwież sesję Supabase i ponów request z nowym tokenem.
function ksefFetch(method, path, body) {
  return ksefFetchRaw(method, path, body).catch(function(e) {
    var is401 = e.status === 401 || (e.message && (e.message.indexOf("invalid jwt") !== -1 || e.message.indexOf("missing jwt") !== -1));
    if (is401) {
      return refreshSession().then(function(s) {
        if (!s || !s.access_token) throw e;
        return ksefFetchRaw(method, path, body, s.access_token);
      });
    }
    throw e;
  });
}

export const ksefApi = {
  // entityId (opcjonalny, wszedzie): credentiale/sesja KSeF sa per podmiot.
  // Gdy pominiety -> backend uzywa podmiotu domyslnego (wsteczna zgodnosc).
  // Sprawdź czy token KSeF jest zapisany (nie zwraca samego tokenu)
  getTokenStatus: function(entityId) {
    return ksefFetch("GET", "/api/ksef/token" + (entityId ? ("?entityId=" + encodeURIComponent(entityId)) : ""));
  },
  // Zapisz certyfikat KSeF — certPem i keyPem to zawartość plików .crt / .key
  saveCert: function(certPem, keyPem, keyPass, env, entityId) {
    return ksefFetch("POST", "/api/ksef/token", { certPem: certPem, keyPem: keyPem, keyPass: keyPass || "", env: env || "test", entityId: entityId || null });
  },
  // Zapisz token KSeF (autoryzacyjny) dla podmiotu.
  saveToken: function(token, env, entityId) {
    return ksefFetch("POST", "/api/ksef/token", { token: token, env: env || "test", entityId: entityId || null });
  },
  // Usuń token KSeF
  deleteToken: function(entityId) {
    return ksefFetch("DELETE", "/api/ksef/token" + (entityId ? ("?entityId=" + encodeURIComponent(entityId)) : ""));
  },
  // Uwierzytelnij w KSeF 2.0 → zwraca { accessToken, refreshToken, expiresAt, baseUrl }
  openSession: function(entityId) {
    return ksefFetch("POST", "/api/ksef/session", entityId ? { entityId: entityId } : {});
  },
  // Wyślij fakturę sprzedażową do KSeF 2.0
  sendInvoice: function(invoiceId, accessToken, baseUrl) {
    if(typeof window!=="undefined"&&window.PD_IS_DEMO)return Promise.reject(new Error("Tryb demo \u2014 wysy\u0142ka do KSeF jest symulowana"));
    return ksefFetch("POST", "/api/ksef/send", { invoiceId: invoiceId, accessToken: accessToken, baseUrl: baseUrl });
  },
  checkStatus: function(invoiceId, accessToken, baseUrl) {
    return ksefFetch("POST", "/api/ksef/status", { invoiceId: invoiceId, accessToken: accessToken, baseUrl: baseUrl });
  },
  // Pobierz pełny XML i dane pojedynczej faktury z KSeF
  getInvoice: function(accessToken, baseUrl, ksefNumber) {
    return ksefFetch("POST", "/api/ksef/invoice", { accessToken: accessToken, baseUrl: baseUrl, ksefNumber: ksefNumber });
  },
  // Pobierz faktury z KSeF 2.0 (kosztowe i/lub sprzedażowe)
  receiveInvoices: function(accessToken, baseUrl, direction, dateFrom, dateTo, entityId) {
    return ksefFetch("POST", "/api/ksef/receive", { accessToken: accessToken, baseUrl: baseUrl, direction: direction, dateFrom: dateFrom, dateTo: dateTo, entityId: entityId });
  },
};

export const adminApi = {
  // Lista wszystkich tenantow z agregowanymi countsami userow i klientow
  getTenants: function(){
    return adminFetch("GET","/api/admin/tenants");
  },
  // Tworzy nowego tenanta. Zwraca pelny rekord z wygenerowanym uuid
  createTenant: function(name){
    return adminFetch("POST","/api/admin/tenants",{name:name});
  },
  // Lista userow w danym tenancie (filtruje po app_metadata.tenant_id)
  getUsers: function(tenantId){
    return adminFetch("GET","/api/admin/users?tenant_id="+encodeURIComponent(tenantId));
  },
  // Tworzy nowego usera. data = {email, password, tenant_id, is_tenant_admin}
  createUser: function(data){
    return adminFetch("POST","/api/admin/users",data);
  },
  // Ban/unban: action = "suspend" | "reactivate"
  setUserBan: function(userId, action){
    return adminFetch("PATCH","/api/admin/users",{user_id:userId,action:action});
  },
  // Aktualizuje config (branding) tenanta. config = {brand_name, logo_url}
  updateTenant: function(tenantId, config){
    return adminFetch("PATCH","/api/admin/tenants",{id:tenantId,config:config});
  }
};

// ── MAIL API (transakcyjny, przez Resend) ────────────────────────────────────
// Wywołuje /api/mail/send z JWT zalogowanego usera.
// Używany przez frontend do: resetu hasła, przypomnień o trialu itp.
// Maile przy rejestracji (welcome) są wysyłane server-side z api/admin/*.

function mailFetch(template, to, data) {
  if(typeof window!=="undefined"&&window.PD_IS_DEMO)return Promise.reject(new Error("Tryb demo \u2014 wysy\u0142ka maili jest symulowana"));
  var userTok = getUserToken();
  return fetch('/api/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + (userTok || ''),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ template: template, to: to, data: data || {} }),
  }).then(function(r) {
    return r.json().then(function(d) {
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      return d;
    });
  });
}

export const mailApi = {
  // Reset hasła — wysyła link generowany przez Supabase
  sendPasswordReset: function(email, resetUrl) {
    return mailFetch('password_reset', email, { reset_url: resetUrl });
  },
  // Przypomnienie o kończącym się trialu (tylko tenant-admin lub super-admin)
  sendTrialExpiring: function(email, brandName, trialEndDate, upgradeUrl) {
    return mailFetch('trial_expiring', email, {
      brand_name: brandName,
      trial_end_date: trialEndDate,
      upgrade_url: upgradeUrl,
    });
  },
};

// ── STRIPE API (checkout/billing) ────────────────────────────────────────────
// Wywołuje /api/stripe/checkout z JWT zalogowanego usera (musi być tenant-admin).

export const stripeApi = {
  // plan = "start" | "studio" | "pro" — zwraca Promise<string> (URL do Stripe Checkout)
  createCheckoutSession: function(plan) {
    var userTok = getUserToken();
    return fetch('/api/stripe/checkout', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (userTok || ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ plan: plan }),
    }).then(function(r) {
      return r.json().then(function(d) {
        if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
        return d.url;
      });
    });
  },
};

