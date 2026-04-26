import { C } from './oversikt-types';

export const globalCss = `
  @keyframes pulse{0%,100%{opacity:.12;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes ovk-check-fade{0%{opacity:0;transform:scale(0.6)}15%{opacity:1;transform:scale(1.1)}30%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}
  @keyframes ovk-dot-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.55;transform:scale(0.85)}}
  *::-webkit-scrollbar{width:0}

  /* Card design — Apple iOS flat */
  .ovk-card {
    background: ${C.cardGrad};
    border: 1px solid ${C.border};
    border-radius: 12px;
    position: relative;
    overflow: hidden;
  }

  /* Section header — Apple iOS */
  .ovk-sec {
    font-size: 13px;
    font-weight: 600;
    color: ${C.t3};
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .ovk-sec::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${C.border};
  }
`;

export const ff = "-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif";
