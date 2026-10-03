import{q as e,f as s}from"./index-D69njkyo.js";const a={async getAll(){return(await e.get("/domains")).data.data||[]}},o=()=>s({queryKey:["domains"],queryFn:a.getAll,staleTime:5*6e4});export{o as u};
