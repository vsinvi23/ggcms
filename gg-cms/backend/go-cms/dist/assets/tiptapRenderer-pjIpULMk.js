const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/index-Dws0xmtY.js","assets/index-Cs5jCkd2.js","assets/extensions-DYHFLGe8.js","assets/index-CEAkNTQa.js","assets/index-Cy7C6ZCz.css","assets/index-B34yvSYg.js","assets/textarea-D_LN6P1B.js","assets/sanitize-rUvTfres.js"])))=>i.map(i=>d[i]);
import{c as i,_ as o}from"./index-CEAkNTQa.js";import{p as m}from"./htmlParser-DDxdF1_6.js";import{s as c}from"./sanitize-rUvTfres.js";/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=i("Bold",[["path",{d:"M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8",key:"mg9rjx"}]]);/**
 * @license lucide-react v0.462.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=i("Italic",[["line",{x1:"19",x2:"10",y1:"4",y2:"4",key:"15jd3p"}],["line",{x1:"14",x2:"5",y1:"20",y2:"20",key:"bu0au3"}],["line",{x1:"15",x2:"9",y1:"4",y2:"20",key:"uljnxc"}]]);async function h(t){if(!t||!t.trim())return"";try{const n=JSON.parse(t),[{generateHTML:r},{tiptapExtensions:e}]=await Promise.all([o(()=>import("./index-Dws0xmtY.js"),__vite__mapDeps([0,1])),o(()=>import("./extensions-DYHFLGe8.js").then(s=>s.e),__vite__mapDeps([2,1,3,4,5,6,7]))]),a=r(n,e);return l(a)}catch{return m(t)}}function l(t){const r=new DOMParser().parseFromString(t,"text/html");return r.body.querySelectorAll("[data-html-embed]").forEach(e=>{const a=e.getAttribute("data-html-embed")||"";e.removeAttribute("data-html-embed"),e.innerHTML=c(a)}),r.body.innerHTML}export{y as B,_ as I,h as r};
