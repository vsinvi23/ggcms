import{n as e,o as s}from"./index-C9QfHZt_.js";const a={async getAll(){return(await e.get("/domains")).data.data||[]}},o=()=>s({queryKey:["domains"],queryFn:a.getAll,staleTime:5*6e4});export{o as u};
