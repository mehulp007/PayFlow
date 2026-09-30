import type { ReactNode } from 'react';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { money } from './api';

export function Heading({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}){
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action&&<div className="heading-action">{action}</div>}</div>;
}
export function StatCard({label,value,icon:Icon,tone='blue',foot}:{label:string;value:number|string;icon:LucideIcon;tone?:'blue'|'mint'|'rose'|'violet';foot?:string}){
  return <div className={`stat-card ${tone}`}><div className="stat-icon"><Icon size={22}/></div><div className="stat-text"><strong>{typeof value==='number'?money(value,true):value}</strong><span>{label}</span>{foot&&<small>{foot}</small>}</div></div>;
}
export function Pill({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'|'info'}){
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function PanelTitle({title,description,action}:{title:string;description?:string;action?:ReactNode}){
  return <div className="panel-title"><div><h2>{title}</h2>{description&&<p>{description}</p>}</div>{action}</div>;
}
export function SmallLink({children,onClick}:{children:ReactNode;onClick:()=>void}){
  return <button className="small-link" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>;
}
