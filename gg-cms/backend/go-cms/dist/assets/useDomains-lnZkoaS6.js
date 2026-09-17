import{n as e,o as s}from"./index-BV3344f1.js";const a={async getAll(){return(await e.get("/domains")).data.data||[]}},o=()=>s({queryKey:["domains"],queryFn:a.getAll,staleTime:5*6e4});export{o as u};
