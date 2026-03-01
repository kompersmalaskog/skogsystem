import { C } from './oversikt-types';

export const globalCss = `
  @keyframes pulse{0%,100%{opacity:.12;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  *::-webkit-scrollbar{width:0}
`;

export const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";
