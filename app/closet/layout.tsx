import type { ReactNode } from 'react';
import ClosetShellNav from './ClosetShellNav';
import ClosetAddRedirect from './ClosetAddRedirect';

export default function ClosetLayout({children}:{children:ReactNode}){
 return <>
  {children}
  <ClosetAddRedirect/>
  <ClosetShellNav/>
 </>;
}
