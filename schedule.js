// 파일 경로: api/schedule.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // 확인할 날짜 (쿼리로 받거나 한국 시간 기준 오늘 날짜 자동 설정)
  let targetDateStr = req.query.date;
  if (!targetDateStr) {
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    targetDateStr = kstNow.toISOString().split('T')[0];
  }

  const CLEANING_TIME = "12시 ~ 15시";
  const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

  const ROOMS = [
    { name: "301호", url: "https://www.airbnb.com/calendar/ical/1806507985433199862.ics?t=949aacc741e34b9a9f11c6e23aa0cf58" },
    { name: "302호", url: "https://www.airbnb.com/calendar/ical/1806515183739604819.ics?t=71853ffcb45c4b33973afab8f17f360e" },
    { name: "303호", url: "https://www.airbnb.com/calendar/ical/1806518624050090241.ics?t=19625fdfac00436f950f5fe9a6d53170" },
    { name: "304호", url: "https://www.airbnb.com/calendar/ical/1806520796565427257.ics?t=257f033576634f0aa7d879bd0dcdd85e" },
    { name: "401호", url: "https://www.airbnb.com/calendar/ical/1801938912692060444.ics?t=b21d1cad69864594a98021fa51a6dd65" },
    { name: "402호", url: "https://www.airbnb.com/calendar/ical/1801943076569177388.ics?t=f39ced254b0641f3af2881c391115e0a" },
    { name: "403호", url: "https://www.airbnb.com/calendar/ical/1801944423119332720.ics?t=bc036ea82af444fabbf546a07000dba5" },
    { name: "404호", url: "https://www.airbnb.com/calendar/ical/1801946047025581646.ics?t=bde1a12a40454b1aa0d80c31a7693816" },
    { name: "501호", url: "https://www.airbnb.com/calendar/ical/1801948749600493440.ics?t=9d843b16b3124d518f7fdab7d398907e" },
    { name: "502호", url: "https://www.airbnb.com/calendar/ical/1801950217521924413.ics?t=1ab06dc4b9084016877dc190677193b5" },
    { name: "503호", url: "https://www.airbnb.com/calendar/ical/1801953371543758027.ics?t=80c0f317c8984a938457f920155ab7da" },
    { name: "504호", url: "https://www.airbnb.com/calendar/ical/1801954847056600224.ics?t=650d6f05df084b3797dd778a45879547" },
  ];

  const parseIcsDate = (val) => {
    const m = val.trim().match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
  };

  const diffDays = (startStr, endStr) => {
    const s = new Date(`${startStr}T00:00:00Z`);
    const e = new Date(`${endStr}T00:00:00Z`);
    return Math.round((e - s) / (1000 * 60 * 60 * 24));
  };

  const tasks = [];

  await Promise.all(
    ROOMS.map(async (room) => {
      try {
        const fetchUrl = `${room.url}&_ts=${Date.now()}`;
        const response = await fetch(fetchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Cache-Control': 'no-cache' }
        });
        const rawText = await response.text();
        
        const unfolded = rawText.replace(/\r?\n[ \t]/g, '');
        const lines = unfolded.split(/\r?\n/);

        let inEvent = false;
        let cur = {};
        let hasCheckout = false;
        const upcomingCheckins = [];

        for (const line of lines) {
          const s = line.trim();
          if (s === 'BEGIN:VEVENT') {
            inEvent = true;
            cur = {};
          } else if (s === 'END:VEVENT') {
            if (inEvent && (cur.SUMMARY || '').toLowerCase() === 'reserved') {
              const dStart = cur.DTSTART ? parseIcsDate(cur.DTSTART) : null;
              const dEnd = cur.DTEND ? parseIcsDate(cur.DTEND) : null;

              if (dStart && dEnd) {
                if (dEnd === targetDateStr) hasCheckout = true;
                if (dStart >= targetDateStr) {
                  upcomingCheckins.push({ start: dStart, nights: diffDays(dStart, dEnd) });
                }
              }
            }
            inEvent = false;
          } else if (inEvent && line.includes(':')) {
            const idx = line.indexOf(':');
            const key = line.slice(0, idx).split(';')[0].trim().toUpperCase();
            const val = line.slice(idx + 1).trim();
            cur[key] = val;
          }
        }

        if (hasCheckout) {
          let nextNights = 0;
          if (upcomingCheckins.length > 0) {
            upcomingCheckins.sort((a, b) => a.start.localeCompare(b.start));
            nextNights = upcomingCheckins[0].nights;
          }
          tasks.push({ name: room.name, nights: nextNights });
        }
      } catch (err) {
        console.error(`Error fetching ${room.name}:`, err);
      }
    })
  );

  tasks.sort((a, b) => a.name.localeCompare(b.name));

  const [y, m, d] = targetDateStr.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const dayLabel = DAY_LABELS[dateObj.getUTCDay()];

  const outputLines = [
    `${m}.${d} (${dayLabel}) schedule`,
    `오늘 청소할 객실은 다음과 같습니다.`
  ];

  if (tasks.length === 0) {
    outputLines.push(`청소 일정 없음`);
  } else {
    for (const t of tasks) {
      const stayTag = t.nights >= 2 ? `${t.nights}연박` : '';
      outputLines.push(`${t.name}/   ${CLEANING_TIME}/    ${stayTag}`);
    }
  }

  res.status(200).json({
    date: targetDateStr,
    text: outputLines.join('\n')
  });
};