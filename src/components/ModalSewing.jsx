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
import { generateFabricOrderPDF, generateClientEmail,


  generateSewingOrderPDF, generateSewingOrderPDFFromRows
} from '../lib/pdf.js';
const ce = React.createElement;

export function ModalSewing(p){
  var SEWING_HOUSES=[
    'TRINITAS — ul. Składowa 9, 86-300 Grudziądz',
    'LaurAles — ul. Kolegialna 35 lok.1, 09-402 Płock',
    'Marcin Dekor — ul. Terespolska 75, 05-074 Halinów, Konik Nowy'
  ];
  var ms=useState('choose'),mode=ms[0],setMode=ms[1];
  var ss=useState(SEWING_HOUSES[0]),selHouse=ss[0],setSelHouse=ss[1];
  var cs=useState(''),customHouse=cs[0],setCustomHouse=cs[1];
  var ns=useState(''),notes=ns[0],setNotes=ns[1];
  var ts=useState(''),term=ts[0],setTerm=ts[1];
  var as=useState(null),attachB64=as[0],setAttachB64=as[1];
  var fns=useState(''),attachName=fns[0],setAttachName=fns[1];
  var allRows=buildSewingRows(p.client);
  var used=useState([]),usedIds=used[0],setUsedIds=used[1];
  var sel=useState([]),selIds=sel[0],setSelIds=sel[1];
  var sh=useState(SEWING_HOUSES[0]),splitHouse=sh[0],setSplitHouse=sh[1];
  var sc2=useState(''),splitCustom=sc2[0],setSplitCustom=sc2[1];
  var sn=useState(''),splitNotes=sn[0],setSplitNotes=sn[1];
  var st2=useState(''),splitTerm=st2[0],setSplitTerm=st2[1];
  var sa=useState(null),splitAttach=sa[0],setSplitAttach=sa[1];
  var sfn=useState(''),splitAttachName=sfn[0],setSplitAttachName=sfn[1];

  function handleFile(ev,setB64,setName){
    var file=ev.target.files&&ev.target.files[0];
    if(!file)return;
    if(file.type!=='application/pdf'){alert('Prosz\u0119 wybra\u0107 plik PDF.');return;}
    var reader=new FileReader();
    reader.onload=function(e){setB64(e.target.result);setName(file.name);};
    reader.readAsDataURL(file);
  }

  function generateSingle(){
    var house=selHouse==='__custom__'?customHouse:selHouse;
    generateSewingOrderPDF(p.client,{sewingHouse:house,notes:notes,term:term,attachB64:attachB64});
    p.onClose();
  }

  function generateSplitBatch(){
    if(!selIds.length){alert('Wybierz przynajmniej jedn\u0105 pozycj\u0119.');return;}
    var house=splitHouse==='__custom__'?splitCustom:splitHouse;
    var selectedRows=selIds.map(function(i){return allRows[i];});
    generateSewingOrderPDFFromRows(selectedRows,p.client,{sewingHouse:house,notes:splitNotes,term:splitTerm,attachB64:splitAttach});
    var newUsed=usedIds.concat(selIds);
    setUsedIds(newUsed);
    setSelIds([]);
    setSplitHouse(SEWING_HOUSES[0]);
    setSplitCustom('');
    setSplitNotes('');
    setSplitTerm('');
    setSplitAttach(null);
    setSplitAttachName('');
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

  function mkTermInput(val,setVal){
    return ce('div',null,
      ce('label',{style:{fontSize:11,fontWeight:700,letterSpacing:'0.07em',color:'var(--t2)',textTransform:'uppercase',display:'block',marginBottom:8}},'TERMIN REALIZACJI'),
      ce('input',{type:'text',value:val,onChange:function(ev){setVal(ev.target.value);},placeholder:'np. 25.04.2026',style:Object.assign({},INP,{minHeight:48})})
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
      mkTermInput(term,setTerm),
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
                background:isUsed?'var(--bg3)':isSel?'rgba(26,26,24,0.04)':'var(--bg)',
                cursor:isUsed?'not-allowed':'pointer',opacity:isUsed?0.45:1,transition:'all .12s'}
            },
              ce('input',{type:'checkbox',checked:isSel,disabled:isUsed,
                onChange:function(){if(!isUsed)toggleSel(i);},
                style:{width:16,height:16,cursor:isUsed?'not-allowed':'pointer',accentColor:'var(--t1)',flexShrink:0}}),
              ce('div',{style:{fontSize:13,color:isUsed?'var(--t3)':'var(--t1)',lineHeight:1.4}},
                ce('span',{style:{fontWeight:600}},r.room+' / '+r.win),
                ce('span',{style:{color:'var(--t2)'}},' \u2014 '+r.type+(r.fabric?' \xb7 '+r.fabric:'')),
                isUsed?ce('span',{style:{fontSize:11,color:'var(--t3)'}},' (ju\u017c przypisane)'):null
              )
            );
          })
        )
      ),
      mkHouseSelect(splitHouse,setSplitHouse,splitCustom,setSplitCustom),
      mkTermInput(splitTerm,setSplitTerm),
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

  return ce('div',{style:{position:'fixed',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:999,padding:'1rem'}},
    ce('div',{style:{background:'var(--bg)',borderRadius:16,padding:'1.8rem',width:'min(560px,96vw)',border:'1px solid var(--bd2)',boxShadow:'0 16px 48px rgba(0,0,0,0.2)',maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:16}},
      ce('div',{style:{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}},
        ce('div',{style:{fontSize:17,fontWeight:700,color:'var(--t1)'}},'\u2702\ufe0f Zlecenie szycia'),
        ce('button',{onClick:p.onClose,style:{border:'none',background:'none',cursor:'pointer',fontSize:22,color:'var(--t3)',padding:'0 4px'}},'\xd7')
      ),
      content
    )
  );
}


// ── MODAL WYBORU POMIESZCZENIA ────────────────────────────────────────

