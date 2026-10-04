import{q as e,h as s}from"./index-DHbQC6_n.js";const a={async getAll(){return(await e.get("/domains")).data.data||[]}},o=()=>s({queryKey:["domains"],queryFn:a.getAll,staleTime:5*6e4});export{o as u};
