import{brand}from'@pinory/config';
export function Logo({large=false,inverse=false}:{large?:boolean;inverse?:boolean}){return <div className={`logo ${large?'large':''} ${inverse?'inverse':''}`}><span className="logo-mark"><i/><i/><b>P</b></span><span>{brand.name}</span></div>}
