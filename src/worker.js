// Coach's understanding step. The only Worker code on the site: wrangler.jsonc runs it first for /api/* only,
// so every page, script and data file is still a free static-asset request.
// It turns a chat message into a small structured request; the browser's keyword engine still writes every answer from site data.
// Workers AI free tier: 10,000 neurons/day. Over that, env.AI.run throws and the browser falls back to keyword-only Coach.

export const MODEL = "@cf/google/gemma-4-26b-a4b-it";

export const SYS = `You read messages sent to Coach, a helper for College Football 27 dynasty mode, and turn each one into a JSON request.
Never answer the message. Only classify it and pull out what it asks for. Use "none" or empty values for anything not asked.

kind:
- plan: wants a dynasty plan, challenge or house rules for a named (or the current) program
- compare: compares two programs
- players: best players, at one program or across a conference or the country
- staff: a program's coaches
- overview: opinion or summary of one program ("what do you think about X", "tell me about X")
- ranking: ranks programs (best, worst, biggest budget, best recruiting, best rebuild jobs)
- beginner: new to dynasty and wants a starting program
- easiest_path: which program has the easiest road to a national title
- challenges: wants challenge ideas without naming a program
- roadmap: future roster holes, departures, seasons ahead at a program
- other: anything else (rule edits, "make it harder", undo, ability or archetype questions, follow-ups)

teams: school names exactly as a fan would write them (e.g. "Oregon", "Ohio State", "Miami"), in the order mentioned. Use the current program only when the message clearly refers to it ("their", "them", "it"). Never invent a program the message doesn't point to.
difficulty: how hard the dynasty plan should be: casual, standard or hard. "challenge", "tough", "brutal" mean hard. Statements about the program itself ("their recruiting makes it easy") are not a difficulty request.
game_difficulty: the in-game difficulty they play on, only if stated: freshman, varsity, all-american or heisman.
exclude: things they refuse to use: portal (transfers), nil (NIL money), five_stars (5-star or blue-chip recruits).
title_goal: true when they want to win a national title or mention the program never winning one.
rebuild, created_coach: true when asked.
position: QB, RB, WR, TE, OL, DL, LB, CB, S, K (kicker), P (punter) or none.
conference: SEC, Big Ten, Big 12, ACC, American, Pac-12, Mountain West, Conference USA, Sun Belt, MAC, Independent, or none.
rank_by: overall, offense, defense, nil, prestige, titles, recruiting, rebuild or none.
no_title_filter: true when they only want programs that have never won a national title.`;

const E = (...v) => ({type: "string", enum: v});
export const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    kind: E("plan", "compare", "players", "staff", "overview", "ranking", "beginner", "easiest_path", "challenges", "roadmap", "other"),
    teams: {type: "array", items: {type: "string"}, maxItems: 2},
    difficulty: E("casual", "standard", "hard", "none"),
    game_difficulty: E("freshman", "varsity", "all-american", "heisman", "none"),
    exclude: {type: "array", items: E("portal", "nil", "five_stars")},
    title_goal: {type: "boolean"}, rebuild: {type: "boolean"}, created_coach: {type: "boolean"},
    position: E("QB", "RB", "WR", "TE", "OL", "DL", "LB", "CB", "S", "K", "P", "none"),
    conference: E("SEC", "Big Ten", "Big 12", "ACC", "American", "Pac-12", "Mountain West", "Conference USA", "Sun Belt", "MAC", "Independent", "none"),
    rank_by: E("overall", "offense", "defense", "nil", "prestige", "titles", "recruiting", "rebuild", "none"),
    no_title_filter: {type: "boolean"}
  },
  required: ["kind", "teams", "difficulty", "game_difficulty", "exclude", "title_goal", "rebuild", "created_coach", "position", "conference", "rank_by", "no_title_filter"]
};

export async function understand(env, q, team){
  const r = await env.AI.run(MODEL, {
    messages: [{role: "system", content: SYS}, {role: "user", content: (team ? `Current program in the conversation: ${team}\n` : "") + `Message: ${q}`}],
    response_format: {type: "json_schema", json_schema: SCHEMA}, max_tokens: 300, temperature: 0,
    chat_template_kwargs: {enable_thinking: false}   // Gemma 4 thinks by default: slower, and it spends the token budget before answering
  });
  // This model answers in the OpenAI chat format; older Workers AI models use {response}.
  const out = r && (r.choices ? r.choices[0].message.content : r.response);
  return typeof out === "string" ? JSON.parse(out) : out;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers: {"content-type": "application/json", "cache-control": "no-store"}});

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (url.pathname !== "/api/coach") return env.ASSETS.fetch(req);
    if (req.method !== "POST") return json({error: "POST only"}, 405);
    // Per-visitor limit so one person or bot can't spend the day's free AI allowance.
    const {success} = await env.COACH_RL.limit({key: req.headers.get("cf-connecting-ip") || "anon"});
    if (!success) return json({error: "rate"}, 429);
    let body; try { body = await req.json(); } catch (e) { return json({error: "bad json"}, 400); }
    const q = String(body.q || "").trim().slice(0, 600), team = String(body.team || "").slice(0, 60);
    if (!q) return json({error: "empty"}, 400);
    try { return json(await understand(env, q, team)); }
    catch (e) { return json({error: "ai"}, 502); }   // includes the daily free allowance running out
  }
};
