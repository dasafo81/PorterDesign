import React, { useState, useRef, useEffect, Fragment } from 'react';
import { sbApi } from '../lib/supabase.js';
import {
  FABRICS, IMG_FALDA_PLASKA, IMG_FALDA_PODWOJNA, IMG_FALDA_POJEDYNCZA,
  IMG_FALDA_POTROJNA, IMG_FALDA_STUDIO, IMG_JZ_ALUMINIUM, IMG_JZ_BAMBOO,
  IMG_JZ_BASSWOOD, IMG_MODEL_FALDA, IMG_MODEL_TASMA, IMG_MODEL_WAVE,
  IMG_OKNO, IMG_ROLETA_BACK, IMG_ROLETA_CASCADE, IMG_ROLETA_DUO,
  IMG_ROLETA_FRONT, IMG_ROLETA_LANCUSZEK_BIALY, IMG_ROLETA_LANCUSZEK_METALOWY, IMG_ROLETA_PODSZEWKA,
  IMG_ROLETA_PRINT, IMG_ROLETA_RELAX, IMG_ROOM_GABINET, IMG_ROOM_KUCHNIA,
  IMG_ROOM_POKÓJ, IMG_ROOM_SALON, IMG_ROOM_SYPIALNIA, JZ,
  JZALUZJA_MOTORS, JZALUZJA_REMOTES, JZ_LABELS, JZ_ZONES,
  KARNISZ_SUPPLIERS, KN, KP, KSLIM,
  KUNIV, LOGO_SRC, PROD_TYPES, RCITY,
  RDUO, REL, ROOM_PRESETS, RS_BASE,
  RS_C, RS_D, RS_E, RS_HEIGHTS,
  RS_OB_B, RS_OB_C, RS_OB_D, RS_PROFIL,
  RS_SUPP_WIDTHS, RS_WIDTHS, SB_STORAGE, WIN_PRESETS,
  buildSewingRows, calc, getPanelsForProd, jzLookup,
  mg, roundTo10
} from '../constants/data.js';
import { generateFabricOrderPDF, getFabricOrderSuppliers, generateClientEmail,


  generateSewingOrderPDF, generateSewingOrderPDFFromRows
} from '../lib/pdf.js';
const ce = React.createElement;

export function ModalSewing(p){
  var SEWING_HOUSES=[
    'TRINITAS — ul. Składowa 9, 86-300 Grudziądz',
    'LAURALES — ul. Kolegialna 35 lok.1, 09-402 Płock',
    'MARCIN DEKOR — ul. Terespolska 75, 05-074 Halinów',
    'NITECZKAMI — Troszyn Polski 38B, 09-530 Troszyn'
  ];
  var ms=useState('choose'),mode=ms[0],setMode=ms[1];
  var ss=useState(SEWING_HOUSES[0]),selHouse=ss[0],setSelHouse=ss[1];
  var cs=useState(''),customHouse=cs[0],setCustomHouse=cs[1];
  var ns=useState(''),notes=ns[0],setNotes=ns[1];
  var ts=useState(''),term=ts[0],setTerm=ts[1];
  var tc=useState(''),termCurtains=tc[0],setTermCurtains=tc[1];
  var tr=useState(''),termRolety=tr[0],setTermRolety=tr[1];
  var as=useState(null),attachB64=as[0],setAttachB64=as[1];
  var fns=useState(''),attachName=fns[0],setAttachName=fns[1];
  var allRows=buildSewingRows(p.client);
  var hasCurtains=allRows.some(function(r){return r._type!=='roleta';});
  var hasRolety=allRows.some(function(r){return r._type==='roleta';});
  var hasBothSewTypes=hasCurtains&&hasRolety;
  var used=useState([]),usedIds=used[0],setUsedIds=used[1];
  var sel=useState([]),selIds=sel[0],setSelIds=sel[1];
  var sh=useState(SEWING_HOUSES[0]),splitHouse=sh[0],setSplitHouse=sh[1];
  var sc2=useState(''),splitCustom=sc2[0],setSplitCustom=sc2[1];
  var sn=useState(''),splitNotes=sn[0],setSplitNotes=sn[1];
  var st2=useState(''),splitTerm=st2[0],setSplitTerm=st2[1];
  var sa=useState(null),splitAttach=sa[0],setSplitAttach=sa[1];
  var sfn=useState(''),splitAttachName=sfn[0],setSplitAttachName=sfn[1];
  var so=useState(null),sewOpts=so[0],setSewOpts=so[1];
  var sop=useState(false),showSewOpts=sop[0],setShowSewOpts=sop[1];
  var sopFrom=useState('single'),sewOptsFrom=sopFrom[0],setSewOptsFrom=sopFrom[1];

  function handleFile(ev,setB64,setName){
    var file=ev.target.files&&ev.target.files[0];
    if(!file)return;
    if(file.type!=='application/pdf'){alert('Prosz\u0119 wybra\u0107 plik PDF.');return;}
    var reader=new FileReader();
    reader.onload=function(e){setB64(e.target.result);setName(file.name);};
    reader.readAsDataURL(file);
  }

  function buildDefaultSewOpts(curtainRows){
    var hasLead=curtainRows.some(function(r){return r.leadInSides==='tak';});
    var hasTasmaNaStojaco=curtainRows.some(function(r){return r.tasmaNaStojaco==='tak';});
    var pv=[];curtainRows.forEach(function(r){if(r.podszewka&&r.podszewka!=='nie'&&r.podszewka!=='-'){var v=r.podszewka;if(pv.indexOf(v)<0)pv.push(v);}});
    var tv=[];curtainRows.forEach(function(r){if(r.tasma&&r.tasma!=='-'){var v=r.tasma;if(tv.indexOf(v)<0)tv.push(v);}});
    var hv=[];curtainRows.forEach(function(r){if(r.haczyk&&r.haczyk!=='-'){var v=r.haczyk;if(hv.indexOf(v)<0)hv.push(v);}});
    var gv=[];curtainRows.forEach(function(r){if(r.glide&&r.glide!=='-'){var v=r.glide;if(gv.indexOf(v)<0)gv.push(v);}});
    var hasWave=curtainRows.some(function(r){return r.szStyle==='Wave';});
    return {leadInSides:hasLead,tasmaNaStojaco:hasTasmaNaStojaco,
      podszewka:pv.length>0,podszewkaNazwa:pv.join(', '),
      ryszka:hv.length>0,ryszkaNazwa:hv.join(' / '),
      tasmyH:tv.length>0,tasmyHNazwa:tv.join(' / '),
      glide:hasWave&&gv.length>0,glideNazwa:gv.join(' / ')};
  }
  function generateSingle(){
    if(hasCurtains){
      setSewOptsFrom('single');
      if(!sewOpts)setSewOpts(buildDefaultSewOpts(allRows.filter(function(r){return r._type!=='roleta';})));
      setShowSewOpts(true);
    }else{doGenerateSingle(null);}
  }
  function doGenerateSingle(opts){
    var house=selHouse==='__custom__'?customHouse:selHouse;
    generateSewingOrderPDF(p.client,{sewingHouse:house,notes:notes,term:term,
      termCurtains:hasBothSewTypes?termCurtains:term,
      termRolety:hasBothSewTypes?termRolety:term,
      attachB64:attachB64,sewOpts:opts});
    p.onClose();
  }

  function generateSplitBatch(){
    if(!selIds.length){alert('Wybierz przynajmniej jedną pozycję.');return;}
    var sc=selIds.map(function(i){return allRows[i];}).filter(function(r){return r._type!=='roleta';});
    if(sc.length){setSewOptsFrom('split');if(!sewOpts)setSewOpts(buildDefaultSewOpts(sc));setShowSewOpts(true);return;}
    doGenerateSplitBatch(null);
  }
  function doGenerateSplitBatch(opts){
    var house=splitHouse==='__custom__'?splitCustom:splitHouse;
    var selectedRows=selIds.map(function(i){return allRows[i];});
    generateSewingOrderPDFFromRows(selectedRows,p.client,{sewingHouse:house,notes:splitNotes,term:splitTerm,attachB64:splitAttach,sewOpts:opts});
    var newUsed=usedIds.concat(selIds);
    setUsedIds(newUsed);setSelIds([]);
    setSplitHouse(SEWING_HOUSES[0]);setSplitCustom('');setSplitNotes('');setSplitTerm('');setSplitAttach(null);setSplitAttachName('');
    if(newUsed.length>=allRows.length) p.onClose();
  }

  function toggleSel(i){
    setSelIds(function(prev){
      return prev.indexOf(i)>=0?prev.filter(function(x){return x!==i;}):prev.concat([i]);
    });
  }

  var INP={padding:'12px 14px',fontSize:15,border:'1.5px solid var(--bd2)',borderRadius:10,background:'var(--bg)',color:'var(--t1)',width:'100%',boxSizing:'border-box',outline:'none'};

  function mkHouseSelect(val,setVal,custom,setCustom){
    return ce('div',null,
      ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'SZWALNIA'),
      ce('select',{value:val,onChange:function(ev){setVal(ev.target.value);},style:Object.assign({},INP,{minHeight:48})},
        SEWING_HOUSES.map(function(h,i){return ce('option',{key:i,value:h},h);}),
        ce('option',{value:'__custom__'},'— Wpisz w\u0142asne dane —')
      ),
      val==='__custom__'?ce('textarea',{value:custom,onChange:function(ev){setCustom(ev.target.value);},placeholder:'Nazwa szwalni, osoba kontaktowa, telefon...',rows:3,style:Object.assign({},INP,{marginTop:8,resize:'vertical',lineHeight:1.5})}):null
    );
  }

  function TermInput(p){var val=p.val,setVal=p.setVal,label=p.label||'TERMIN REALIZACJI';
    var cs=useState(false),calOpen=cs[0],setCalOpen=cs[1];
    var today=new Date();
    var initYear=today.getFullYear(),initMonth=today.getMonth();
    var parsed=val&&/^\d{2}\.\d{2}\.\d{4}$/.test(val)?new Date(val.split('.')[2],val.split('.')[1]-1,val.split('.')[0]):null;
    var vs=useState(parsed&&!isNaN(parsed)?parsed.getFullYear():initYear),viewYear=vs[0],setViewYear=vs[1];
    var vm=useState(parsed&&!isNaN(parsed)?parsed.getMonth():initMonth),viewMonth=vm[0],setViewMonth=vm[1];

    var MONTHS=['Stycze\u0144','Luty','Marzec','Kwiecie\u0144','Maj','Czerwiec','Lipiec','Sierpie\u0144','Wrzesie\u0144','Pa\u017adziernik','Listopad','Grudzie\u0144'];
    var DOW=['Pn','Wt','\u015ar','Cz','Pt','Sb','Nd'];

    function prevMonth(){
      if(viewMonth===0){setViewMonth(11);setViewYear(function(y){return y-1;});}
      else setViewMonth(function(m){return m-1;});
    }
    function nextMonth(){
      if(viewMonth===11){setViewMonth(0);setViewYear(function(y){return y+1;});}
      else setViewMonth(function(m){return m+1;});
    }
    function pickDate(d){
      var dd=String(d).padStart(2,'0');
      var mm=String(viewMonth+1).padStart(2,'0');
      setVal(dd+'.'+mm+'.'+viewYear);
      setCalOpen(false);
    }

    var firstDay=new Date(viewYear,viewMonth,1).getDay();
    var offset=(firstDay===0?6:firstDay-1);
    var daysInMonth=new Date(viewYear,viewMonth+1,0).getDate();
    var cells=[];
    for(var i=0;i<offset;i++)cells.push(null);
    for(var d2=1;d2<=daysInMonth;d2++)cells.push(d2);
    while(cells.length%7!==0)cells.push(null);

    var selectedDay=parsed&&!isNaN(parsed)&&parsed.getFullYear()===viewYear&&parsed.getMonth()===viewMonth?parsed.getDate():null;
    var todayDay=today.getFullYear()===viewYear&&today.getMonth()===viewMonth?today.getDate():null;

    return ce('div',{style:{position:'relative'}},
      ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},label),
      ce('div',{style:{display:'flex',gap:8,alignItems:'center'}},
        ce('input',{type:'text',value:val,onChange:function(ev){setVal(ev.target.value);},placeholder:'np. 25.04.2026',style:Object.assign({},INP,{minHeight:48,flex:1})}),
        ce('button',{
          type:'button',
          onClick:function(){setCalOpen(function(o){return !o;});},
          title:'Otw\u00f3rz kalendarz',
          style:{width:48,height:48,borderRadius:10,border:'1.5px solid var(--bd2)',background:calOpen?'var(--t1)':'var(--bg2)',
            cursor:'pointer',fontSize:20,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,
            color:calOpen?'#fff':'var(--t1)',transition:'all .15s'}
        },'\uD83D\uDCC5')
      ),
      calOpen?ce('div',{style:{
        position:'absolute',top:'calc(100% + 6px)',left:0,zIndex:2000,
        background:'var(--bg)',border:'1.5px solid var(--bd2)',borderRadius:14,
        boxShadow:'0 8px 32px rgba(0,0,0,0.18)',padding:'14px 16px',width:280,
        userSelect:'none'
      }},
        ce('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}},
          ce('button',{type:'button',onClick:prevMonth,style:{border:'none',background:'none',cursor:'pointer',fontSize:18,color:'var(--t2)',padding:'2px 6px',borderRadius:6}},'\u2039'),
          ce('span',{style:{fontWeight:700,fontSize:14,color:'var(--t1)'}},MONTHS[viewMonth]+' '+viewYear),
          ce('button',{type:'button',onClick:nextMonth,style:{border:'none',background:'none',cursor:'pointer',fontSize:18,color:'var(--t2)',padding:'2px 6px',borderRadius:6}},'\u203a')
        ),
        ce('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2,marginBottom:4}},
          DOW.map(function(d3,i){return ce('div',{key:i,style:{textAlign:'center',fontSize:10,fontWeight:700,color:'var(--t3)',padding:'2px 0'}},d3);})
        ),
        ce('div',{style:{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:2}},
          cells.map(function(day,idx2){
            if(!day) return ce('div',{key:'e'+idx2});
            var isSel=day===selectedDay;
            var isToday=day===todayDay;
            return ce('button',{
              key:'d'+day,
              type:'button',
              onClick:function(){pickDate(day);},
              style:{
                padding:'6px 2px',borderRadius:8,border:isToday&&!isSel?'1.5px solid var(--bd2)':'1.5px solid transparent',
                background:isSel?'var(--t1)':'transparent',
                color:isSel?'#fff':isToday?'var(--t1)':'var(--t2)',
                fontWeight:isSel||isToday?700:400,
                fontSize:13,cursor:'pointer',textAlign:'center',transition:'all .1s'
              }
            },day);
          })
        ),
        ce('div',{style:{marginTop:10,paddingTop:8,borderTop:'1px solid var(--bd3)',display:'flex',justifyContent:'space-between',alignItems:'center'}},
          ce('button',{type:'button',onClick:function(){
            var t2=new Date();setViewYear(t2.getFullYear());setViewMonth(t2.getMonth());
          },style:{border:'none',background:'none',cursor:'pointer',fontSize:12,color:'var(--t3)'}},'Dzisiaj'),
          ce('button',{type:'button',onClick:function(){setCalOpen(false);},
            style:{border:'none',background:'none',cursor:'pointer',fontSize:12,color:'var(--t3)'}},'\u00d7 Zamknij')
        )
      ):null
    );
  }

  function mkNotesInput(val,setVal){
    return ce('div',null,
      ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'UWAGI DO ZLECENIA'),
      ce('textarea',{value:val,onChange:function(ev){setVal(ev.target.value);},placeholder:'Wpisz uwagi dla szwalni...',rows:4,style:Object.assign({},INP,{resize:'vertical',lineHeight:1.6,minHeight:100})})
    );
  }

  function mkAttachInput(b64,setB64,name,setName){
    return ce('div',null,
      ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'ZA\u0141\u0104CZNIK PDF'),
      ce('label',{style:{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',border:'2px dashed var(--bd2)',borderRadius:10,cursor:'pointer',background:b64?'var(--grl)':'transparent'}},
        ce('span',{style:{fontSize:20}},b64?'\u2705':'\uD83D\uDCCE'),
        ce('span',{style:{fontSize:14,color:'var(--t2)'}},b64?name:'Wybierz plik PDF (opcjonalnie)'),
        ce('input',{type:'file',accept:'.pdf,application/pdf',onChange:function(ev){handleFile(ev,setB64,setName);},style:{display:'none'}})
      ),
      b64?ce('button',{onClick:function(){setB64(null);setName('');},style:{marginTop:6,border:'none',background:'none',cursor:'pointer',fontSize:12,color:'var(--t3)'}},'\xd7 Usu\u0144 za\u0142\u0105cznik'):null
    );
  }

  var content;

  if(mode==='choose'){
    content=ce('div',{style:{display:'flex',flexDirection:'column',gap:12}},
      ce('div',{style:{fontSize:13,color:'var(--t2)',marginBottom:4}},'Wybierz spos\xf3b generowania:'),
      ce('button',{
        onClick:function(){setMode('single');},
        style:{padding:'18px 20px',borderRadius:12,border:'2px solid var(--bd2)',background:'var(--bg)',cursor:'pointer',textAlign:'left',transition:'all .15s'}
      },
        ce('div',{style:{fontSize:15,fontWeight:700,color:'var(--t1)',marginBottom:4}},'\u2702\ufe0f Zamówienie do jednej szwalni'),
        ce('div',{style:{fontSize:13,color:'var(--t2)'}},'Wszystkie pozycje — jeden PDF.')
      ),
      allRows.length>1
        ?ce('button',{
            onClick:function(){setMode('split');},
            style:{padding:'18px 20px',borderRadius:12,border:'2px solid var(--bd2)',background:'var(--bg)',cursor:'pointer',textAlign:'left',transition:'all .15s'}
          },
            ce('div',{style:{fontSize:15,fontWeight:700,color:'var(--t1)',marginBottom:4}},'\u2702\ufe0f\u2702\ufe0f Zamówienie dzielone'),
            ce('div',{style:{fontSize:13,color:'var(--t2)'}},'Wybierasz pozycje i generujesz osobny PDF dla ka\u017cdej szwalni.')
          )
        :ce('div',{style:{padding:'14px',borderRadius:12,border:'1.5px solid var(--bd3)',background:'var(--bg2)',fontSize:13,color:'var(--t3)'}},'Wymagane co najmniej 2 pozycje szycia.')
    );

  }else if(mode==='single'){
    content=ce('div',{style:{display:'flex',flexDirection:'column',gap:16}},
      ce('button',{onClick:function(){setMode('choose');},style:{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'var(--t2)',textAlign:'left',padding:0}},'\u2190 Wr\xf3\u0107'),
      mkHouseSelect(selHouse,setSelHouse,customHouse,setCustomHouse),
      hasBothSewTypes
        ?ce('div',{style:{display:'flex',flexDirection:'column',gap:12}},
            ce('div',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',marginBottom:2}},'TERMINY REALIZACJI — dwa typy szycia'),
            ce(TermInput,{val:termCurtains,setVal:setTermCurtains,label:'TERMIN — Zas\u0142ony / Firany'}),
            ce(TermInput,{val:termRolety,setVal:setTermRolety,label:'TERMIN — Rolety rzymskie'})
          )
        :ce(TermInput,{val:term,setVal:setTerm}),
      mkNotesInput(notes,setNotes),
      mkAttachInput(attachB64,setAttachB64,attachName,setAttachName),
      ce('div',{style:{display:'flex',gap:10,marginTop:4}},
        ce('button',{onClick:generateSingle,style:{flex:1,padding:'15px 20px',borderRadius:12,border:'none',background:'var(--t1)',color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer'}},'\u2702\ufe0f Generuj PDF'),
        ce('button',{onClick:p.onClose,style:{padding:'15px 20px',borderRadius:12,border:'1.5px solid var(--bd2)',background:'transparent',color:'var(--t2)',fontSize:15,cursor:'pointer'}},'Anuluj')
      )
    );

  }else if(mode==='split'){
    var remaining=allRows.length-usedIds.length;
    content=ce('div',{style:{display:'flex',flexDirection:'column',gap:16}},
      usedIds.length===0?ce('button',{onClick:function(){setMode('choose');},style:{border:'none',background:'none',cursor:'pointer',fontSize:13,color:'var(--t2)',textAlign:'left',padding:0}},'\u2190 Wr\xf3\u0107'):null,
      ce('div',{style:{background:'var(--bg2)',border:'1px solid var(--bd2)',borderRadius:10,padding:'10px 14px',fontSize:13}},
        ce('span',{style:{fontWeight:700,color:'var(--t1)'}},'Zlecenie '+(usedIds.length>0?'kolejne':'pierwsze')),
        ce('span',{style:{color:'var(--t2)'}},' \u2014 pozosta\u0142o '+remaining+' pozycji')
      ),
      ce('div',null,
        ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:10}},'WYBIERZ POZYCJE DO TEGO ZLECENIA'),
        ce('div',{style:{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}},
          allRows.map(function(r,i){
            var isUsed=usedIds.indexOf(i)>=0;
            var isSel=selIds.indexOf(i)>=0;
            return ce('label',{
              key:i,
              style:{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,
                border:'1.5px solid '+(isSel?'var(--t1)':isUsed?'var(--bd3)':'var(--bd2)'),
                background:isUsed?'var(--bg3)':isSel?'var(--bd3)':'var(--bg)',
                cursor:isUsed?'not-allowed':'pointer',opacity:isUsed?0.45:1,transition:'all .12s'}
            },
              ce('input',{type:'checkbox',checked:isSel,disabled:isUsed,
                onChange:function(){if(!isUsed)toggleSel(i);},
                style:{width:16,height:16,cursor:isUsed?'not-allowed':'pointer',accentColor:'var(--t1)',flexShrink:0}}),
              ce('div',{style:{fontSize:13,color:isUsed?'var(--t3)':'var(--t1)',lineHeight:1.4}},
                ce('span',{style:{fontWeight:600}},r.room+' / '+r.win+' — '+r.type),
                ce('span',{style:{color:'var(--t2)'}},' '+(r.fabric&&r.fabric!=='(brak)'?'\xb7 '+r.fabric:''+(r.fabric==='(brak)'?'\xb7 brak tkaniny':''))),
                isUsed?ce('span',{style:{fontSize:11,color:'var(--t3)'}},' (ju\u017c przypisane)'):null
              )
            );
          })
        )
      ),
      mkHouseSelect(splitHouse,setSplitHouse,splitCustom,setSplitCustom),
      ce(TermInput,{val:splitTerm,setVal:setSplitTerm}),
      mkNotesInput(splitNotes,setSplitNotes),
      mkAttachInput(splitAttach,setSplitAttach,splitAttachName,setSplitAttachName),
      ce('div',{style:{display:'flex',gap:10,marginTop:4}},
        ce('button',{
          onClick:generateSplitBatch,
          disabled:!selIds.length,
          style:{flex:1,padding:'15px 20px',borderRadius:12,border:'none',
            background:selIds.length?'var(--t1)':'var(--grm)',color:'#fff',
            fontSize:15,fontWeight:600,cursor:selIds.length?'pointer':'not-allowed',transition:'all .15s'}
        },selIds.length?('\u2702\ufe0f Generuj PDF ('+(usedIds.length+selIds.length)+'/'+allRows.length+')'):'\u2702\ufe0f Wybierz pozycje...'),
        ce('button',{onClick:p.onClose,style:{padding:'15px 20px',borderRadius:12,border:'1.5px solid var(--bd2)',background:'transparent',color:'var(--t2)',fontSize:15,cursor:'pointer'}},'Zako\u0144cz')
      )
    );
  }

  var INP_SO={padding:'8px 10px',fontSize:13,border:'1.5px solid var(--bd2)',borderRadius:8,background:'var(--bg)',color:'var(--t1)',boxSizing:'border-box',outline:'none'};
  function SewOptsRow(rp){
    var opts=sewOpts||{};
    var chk=!!(opts[rp.checkKey]);
    return ce('div',{style:{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:'0.5px solid var(--bd2)'}},
      ce('input',{type:'checkbox',checked:chk,onChange:function(e){var k=rp.checkKey;setSewOpts(function(prev){var n=Object.assign({},prev||{});n[k]=e.target.checked;return n;});},style:{width:16,height:16,cursor:'pointer',accentColor:'var(--t1)',flexShrink:0}}),
      ce('span',{style:{fontSize:13,color:'var(--t1)',width:190,flexShrink:0,fontWeight:chk?600:400}},rp.label),
      chk&&rp.textKey?ce('input',{type:'text',value:((sewOpts||{})[rp.textKey]||''),onChange:function(e){var k2=rp.textKey;setSewOpts(function(prev){var n=Object.assign({},prev||{});n[k2]=e.target.value;return n;});},placeholder:rp.placeholder||'',style:Object.assign({},INP_SO,{flex:1})}):null
    );
  }
  function confirmSewOpts(){
    setShowSewOpts(false);
    if(sewOptsFrom==='single')doGenerateSingle(sewOpts);
    else doGenerateSplitBatch(sewOpts);
  }
  return ce(Fragment,null,
    showSewOpts?ce('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1100,padding:'1rem'}},
      ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:'1.6rem',width:'min(500px,96vw)',border:'1px solid var(--bd2)',boxShadow:'0 16px 48px rgba(0,0,0,0.25)',display:'flex',flexDirection:'column',gap:4}},
        ce('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}},
          ce('div',{style:{fontSize:16,fontWeight:700,color:'var(--t1)'}},'✂️ Opcje szycia — zasłony i firany'),
          ce('button',{onClick:function(){setShowSewOpts(false);},style:{border:'none',background:'none',cursor:'pointer',fontSize:22,color:'var(--t3)',padding:'0 4px'}},'×')
        ),
        ce('div',{style:{fontSize:12,color:'var(--t2)',marginBottom:6}},'Odznacz opcje, które nie dotyczą tego zlecenia. Wartości wypełniane automatycznie z produktów.'),
        ce(SewOptsRow,{checkKey:'leadInSides',label:'Ołów w bokach'}),
        ce(SewOptsRow,{checkKey:'tasmaNaStojaco',label:'Taśma na stojąco'}),
        ce(SewOptsRow,{checkKey:'podszewka',label:'Podszewka',textKey:'podszewkaNazwa',placeholder:'np. Trevira CS, ecru'}),
        ce(SewOptsRow,{checkKey:'ryszka',label:'Wysokość ryszki',textKey:'ryszkaNazwa',placeholder:'np. 2.5 cm'}),
        ce(SewOptsRow,{checkKey:'tasmyH',label:'Wysokość taśmy',textKey:'tasmyHNazwa',placeholder:'np. 8 cm'}),
        ce(SewOptsRow,{checkKey:'glide',label:'Odstępy ślizgów (Wave)',textKey:'glideNazwa',placeholder:'np. 8 cm'}),
        ce('div',{style:{display:'flex',gap:10,marginTop:14}},
          ce('button',{onClick:confirmSewOpts,style:{flex:1,padding:'14px 20px',borderRadius:12,border:'none',background:'var(--t1)',color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer'}},'✂️ Generuj PDF'),
          ce('button',{onClick:function(){setShowSewOpts(false);},style:{padding:'14px 20px',borderRadius:12,border:'1.5px solid var(--bd2)',background:'transparent',color:'var(--t2)',fontSize:15,cursor:'pointer'}},'Anuluj')
        )
      )
    ):null,
    ce('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'1rem'}},
    ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:'1.8rem',width:'min(560px,96vw)',border:'1px solid var(--bd2)',boxShadow:'0 16px 48px rgba(0,0,0,0.2)',maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}},
      ce('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
        ce('div',{style:{fontSize:17,fontWeight:700,color:'var(--t1)'}},'✂️ Zlecenie szycia'),
        ce('button',{onClick:p.onClose,style:{border:'none',background:'none',cursor:'pointer',fontSize:22,color:'var(--t3)',padding:'0 4px'}},'×')
      ),
      content
    )
  ));
}


// ── MODAL ZAMÓWIENIA TKANINY (wybór szwalni + uwagi) ──────────────────
export function ModalFabricOrder(p){
  var SEWING_HOUSES=[
    'TRINITAS — ul. Składowa 9, 86-300 Grudziądz',
    'LAURALES — ul. Kolegialna 35 lok.1, 09-402 Płock',
    'MARCIN DEKOR — ul. Terespolska 75, 05-074 Halinów',
    'NITECZKAMI — Troszyn Polski 38B, 09-530 Troszyn'
  ];
  var ss=useState(SEWING_HOUSES[0]),selHouse=ss[0],setSelHouse=ss[1];
  var cs=useState(''),customHouse=cs[0],setCustomHouse=cs[1];
  var ns=useState(''),notes=ns[0],setNotes=ns[1];
  // Lista dostawcow liczona raz przy otwarciu modala
  var sl=useState(function(){return getFabricOrderSuppliers(p.client);}),sups=sl[0];
  var ds=useState([]),doneSups=ds[0],setDoneSups=ds[1];
  var multi=sups.length>1;

  var INP={padding:'12px 14px',fontSize:15,border:'1.5px solid var(--bd2)',borderRadius:10,background:'var(--bg)',color:'var(--t1)',width:'100%',boxSizing:'border-box',outline:'none'};

  function houseVal(){return selHouse==='__custom__'?customHouse:selHouse;}

  function generate(){
    generateFabricOrderPDF(p.client,{sewingHouse:houseVal(),notes:notes});
    p.onClose();
  }

  // Jeden klik = jedno okno popup — przegladarka blokuje kolejne okna otwarte
  // bez interakcji uzytkownika, wiec przy kilku dostawcach generujemy pojedynczo.
  function genFor(sup){
    generateFabricOrderPDF(p.client,{sewingHouse:houseVal(),notes:notes,supplier:sup});
    setDoneSups(function(prev){return prev.indexOf(sup)>=0?prev:prev.concat([sup]);});
  }

  return ce('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'1rem'}},
    ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:'1.8rem',width:'min(560px,96vw)',border:'1px solid var(--bd2)',boxShadow:'0 16px 48px rgba(0,0,0,0.2)',maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}},
      ce('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
        ce('div',{style:{fontSize:17,fontWeight:700,color:'var(--t1)'}},'\uD83E\uDDF5 Zamówienie tkaniny'),
        ce('button',{onClick:p.onClose,style:{border:'none',background:'none',cursor:'pointer',fontSize:22,color:'var(--t3)',padding:'0 4px'}},'\xd7')
      ),
      ce('div',{style:{fontSize:13,color:'var(--t2)'}},'Zamówienie tkaniny od producenta — podaj szwalnié docelową (opcjonalnie).'),
      ce('div',null,
        ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'SZWALNIA'),
        ce('select',{value:selHouse,onChange:function(ev){setSelHouse(ev.target.value);},style:Object.assign({},INP,{minHeight:48})},
          SEWING_HOUSES.map(function(h,i){return ce('option',{key:i,value:h},h);}),
          ce('option',{value:'__custom__'},'— Wpisz własne dane —')
        ),
        selHouse==='__custom__'?ce('textarea',{value:customHouse,onChange:function(ev){setCustomHouse(ev.target.value);},placeholder:'Nazwa szwalni, osoba kontaktowa, telefon...',rows:3,style:Object.assign({},INP,{marginTop:8,resize:'vertical',lineHeight:1.5})}):null
      ),
      ce('div',null,
        ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'UWAGI DO ZLECENIA'),
        ce('textarea',{value:notes,onChange:function(ev){setNotes(ev.target.value);},placeholder:'Wpisz uwagi do zamówienia tkaniny...',rows:4,style:Object.assign({},INP,{resize:'vertical',lineHeight:1.6,minHeight:100})})
      ),
      multi?ce('div',null,
        ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:6}},'DOSTAWCY \u2014 OSOBNY PDF DLA KA\u017bDEGO'),
        ce('div',{style:{fontSize:12,color:'var(--t3)',marginBottom:10,lineHeight:1.5}},'Przegl\u0105darka blokuje otwieranie kilku okien naraz \u2014 kliknij kolejno ka\u017cdego dostawc\u0119.'),
        ce('div',{style:{display:'flex',flexDirection:'column',gap:8}},
          sups.map(function(s){
            var done=doneSups.indexOf(s.sup)>=0;
            return ce('button',{key:s.sup,onClick:function(){genFor(s.sup);},
              style:{display:'flex',alignItems:'center',gap:8,width:'100%',padding:'13px 16px',borderRadius:12,
                border:'1.5px solid '+(done?'var(--bd2)':'var(--t2)'),
                background:done?'transparent':'var(--t2)',
                color:done?'var(--t2)':'#fff',fontSize:14,fontWeight:600,cursor:'pointer',textAlign:'left'}},
              ce('span',null,(done?'\u2713':'\uD83E\uDDF5')+' '+s.sup),
              ce('span',{style:{marginLeft:'auto',fontSize:12,fontWeight:500,opacity:0.85}},
                s.metry.toFixed(2).replace('.',',')+' mb \u00b7 '+s.count+' poz.')
            );
          })
        )
      ):null,
      ce('div',{style:{display:'flex',gap:10,marginTop:4}},
        multi?null:ce('button',{onClick:generate,style:{flex:1,padding:'15px 20px',borderRadius:12,border:'none',background:'var(--t2)',color:'#fff',fontSize:15,fontWeight:600,cursor:'pointer'}},'\uD83E\uDDF5 Generuj PDF'),
        ce('button',{onClick:p.onClose,style:{flex:multi?1:'0 0 auto',padding:'15px 20px',borderRadius:12,border:'1.5px solid var(--bd2)',background:'transparent',color:'var(--t2)',fontSize:15,cursor:'pointer'}},multi?'Zamknij':'Anuluj')
      )
    )
  );
}


// ── MODAL WYBORU POMIESZCZENIA ────────────────────────────────────────

