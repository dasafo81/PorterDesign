export const SB_URL="https://rkcidwusjzvfwxszotnb.supabase.co";
export const SB_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrY2lkd3Vzanp2Znd4c3pvdG5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MDU4NzIsImV4cCI6MjA5MDE4MTg3Mn0.N-frD06x0MzSg8dHmz-xneA16QvVrBmAYUg3ileNpXw";

function sbFetch(method, path, body){
  return fetch(SB_URL+"/rest/v1/"+path, {
    method: method,
    headers: {
      "apikey": SB_KEY,
      "Authorization": "Bearer "+SB_KEY,
      "Content-Type": "application/json",
      "Prefer": method==="POST"?"return=representation":"return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  }).then(function(r){
    if(!r.ok) return r.text().then(function(t){throw new Error(t);});
    var ct=r.headers.get("content-type")||"";
    if(ct.includes("json")) return r.json();
    return null;
  });
}

export const sbApi = {
  // Pobierz wszystkich klientów
  getClients: function(){
    return sbFetch("GET","clients?select=*&order=id.desc");
  },
  // Dodaj nowego klienta
  addClient: function(name, addr, phone, email){
    return sbFetch("POST","clients",{name:name,addr:addr,phone:phone||"",email:email||"",rooms:[{id:1,name:"Salon",img:IMG_ROOM_SALON,windows:[]}]});
  },
  // Zaktualizuj rooms klienta (zapisuje cały JSON)
  updateClient: function(id, data){
    return sbFetch("PATCH","clients?id=eq."+id, data);
  },
  // Usuń klienta
  deleteClient: function(id){
    return sbFetch("DELETE","clients?id=eq."+id);
  },
  updateClientStatus: function(id,status){
    return sbFetch("PATCH","clients?id=eq."+id,{status:status});
  },
  // ── DEALS (CRM) ──
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
  }
};

// ── SUPABASE STORAGE IMAGES ───────────────────────────────────────────────
var SB_STORAGE = SB_URL + "/storage/v1/object/public/assets/porter-design-assets/";

function imgUrl(path) {
  return SB_STORAGE + path;
}

// Logo
var LOGO_SRC          = imgUrl("logo.png");

// Pokoje
var IMG_ROOM_SALON    = imgUrl("rooms/salon.jpg");
var IMG_ROOM_KUCHNIA  = imgUrl("rooms/kuchnia.jpg");
var IMG_ROOM_SYPIALNIA= imgUrl("rooms/sypialnia.jpg");
var IMG_ROOM_POKÓJ    = imgUrl("rooms/pokoj.jpg");
var IMG_ROOM_GABINET  = imgUrl("rooms/gabinet.jpg");
var IMG_OKNO          = imgUrl("rooms/okno.jpg");

// Żaluzje
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

// Zasłony / fałdy
var IMG_FALDA_POJEDYNCZA = imgUrl("zasony/falda-pojedyncza.jpg");
var IMG_FALDA_PODWOJNA   = imgUrl("zasony/falda-podwojna.jpg");
var IMG_FALDA_POTROJNA   = imgUrl("zasony/falda-potrojna.jpg");
var IMG_FALDA_PLASKA     = imgUrl("zasony/falda-plaska.jpg");
var IMG_FALDA_STUDIO     = imgUrl("zasony/falda-studio.jpg");
var IMG_MODEL_TASMA      = imgUrl("zasony/model-tasma.jpg");
var IMG_MODEL_WAVE       = imgUrl("zasony/model-wave.jpg");
var IMG_MODEL_FALDA      = imgUrl("zasony/model-falda.jpg");
