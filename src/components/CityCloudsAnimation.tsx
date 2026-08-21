export const CityCloudsAnimation = () => (
  <svg className="city-clouds-overlay" viewBox="0 0 1189.9199 705.749994" preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <filter id="city-cloud-overlay-near" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="1.8" /></filter>
      <filter id="city-cloud-overlay-middle" x="-30%" y="-50%" width="160%" height="200%"><feGaussianBlur stdDeviation="4.5" /></filter>
      <filter id="city-cloud-overlay-far" x="-40%" y="-70%" width="180%" height="240%"><feGaussianBlur stdDeviation="10" /></filter>
    </defs>
    <g className="city-scene__clouds">
      <g className="city-scene__cloud city-scene__cloud--puff-small"><g transform="scale(.55)"><ellipse cx="0" cy="8" rx="90" ry="26" /><circle cx="-48" cy="-9" r="31" /><circle cx="-5" cy="-25" r="43" /><circle cx="43" cy="-8" r="34" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--wisp-wide"><g transform="scale(1.1)"><ellipse cx="0" cy="0" rx="132" ry="19" /><ellipse cx="-92" cy="5" rx="76" ry="16" /><ellipse cx="98" cy="-4" rx="88" ry="15" /><ellipse cx="24" cy="-18" rx="69" ry="18" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--cluster-medium"><g transform="scale(.85)"><ellipse cx="0" cy="12" rx="112" ry="30" /><circle cx="-66" cy="-4" r="38" /><circle cx="-20" cy="-24" r="51" /><circle cx="35" cy="-12" r="42" /><circle cx="75" cy="3" r="31" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--fog-bank"><g transform="scale(1.55)"><ellipse cx="0" cy="4" rx="145" ry="25" /><ellipse cx="-112" cy="9" rx="94" ry="20" /><ellipse cx="108" cy="8" rx="102" ry="22" /><ellipse cx="-35" cy="-13" rx="85" ry="22" /><ellipse cx="65" cy="-10" rx="72" ry="19" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--puff-tiny"><g transform="scale(.48)"><ellipse cx="0" cy="5" rx="78" ry="23" /><circle cx="-33" cy="-11" r="29" /><circle cx="10" cy="-20" r="38" /><circle cx="48" cy="-5" r="25" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--tower-soft"><g transform="scale(1.05)"><ellipse cx="0" cy="12" rx="105" ry="31" /><circle cx="-52" cy="-5" r="39" /><circle cx="-8" cy="-36" r="54" /><circle cx="43" cy="-19" r="45" /><circle cx="74" cy="3" r="30" /></g></g>
      <g className="city-scene__cloud city-scene__cloud--high-long"><g transform="scale(.75)"><ellipse cx="0" cy="4" rx="128" ry="22" /><ellipse cx="-78" cy="-3" rx="72" ry="19" /><ellipse cx="82" cy="7" rx="78" ry="18" /><circle cx="18" cy="-20" r="31" /></g></g>
    </g>
  </svg>
)
