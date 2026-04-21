import { C } from './oversikt-types';

export const globalCss = `
  @keyframes pulse{0%,100%{opacity:.12;transform:scale(1)}50%{opacity:0;transform:scale(2.2)}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes ovk-check-fade{0%{opacity:0;transform:scale(0.6)}15%{opacity:1;transform:scale(1.1)}30%{transform:scale(1)}80%{opacity:1}100%{opacity:0}}
  *::-webkit-scrollbar{width:0}

  /* Card design — matched to UppfoljningVy */
  .ovk-card {
    background: ${C.cardGrad};
    border: 1px solid ${C.border};
    border-top-color: ${C.borderTop};
    border-radius: 16px;
    box-shadow: ${C.shadowSm};
    position: relative;
    overflow: hidden;
  }
  .ovk-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: -20%;
    right: -20%;
    height: 1px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
    pointer-events: none;
  }

  /* Section header — matched to UppfoljningVy .sec-label */
  .ovk-sec {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
