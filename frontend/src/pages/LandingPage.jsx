import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// ─── LOCAL IMAGE IMPORTS (your actual file paths) ─────────────────
import logo     from './image/logo.png';
import banner1  from './image/banner1.png';
import imagePng from './image/image.png';
import thali2   from './image/thali2.png';
import thali3   from './image/thali3.png';

// ─── MEALS DATA ───────────────────────────────────────────────────
const MEALS = [
  {
    title: 'Dal-Rice Tiffin',
    desc:  'Comfort dal, steamed rice, 2 fresh rotis & seasonal sabji — the classic everyday home meal.',
    badge: 'veg',
    img:   thali2,
  },
  {
    title: 'Paneer Thali',
    desc:  'Creamy paneer sabji with 3 rotis, dal, rice & a small sweet — full Gujarati satisfaction.',
    badge: 'veg',
    img:   thali3,
  },
  {
    title: 'Jain Special Tiffin',
    desc:  'Pure Jain food — no onion, no garlic. Dal, rice, sabji & roti made fresh daily with care.',
    badge: 'jain',
    img:   imagePng,
  },
];

const TESTIMONIALS = [
  {
    text: 'MealSetu changed my daily life! Fresh home-cooked food every day, just like mom makes. Quality is amazing and delivery is always on time.',
    name: 'Priya Shah', role: 'Working Professional, Navsari', rating: 5, initials: 'PS',
  },
  {
    text: 'As a student staying away from home, this service is a blessing. Affordable, tasty, so convenient. The Jain option is perfect for me!',
    name: 'Rohan Mehta', role: 'MCA Student, Navsari', rating: 5, initials: 'RM',
  },
  {
    text: "I subscribed to the monthly plan and I couldn't be happier. Saves so much time and money compared to eating out daily.",
    name: 'Kavita Patel', role: 'IT Professional, Navsari', rating: 5, initials: 'KP',
  },
];

// ─── STYLES ───────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;700;800;900&family=Poppins:wght@300;400;500;600&display=swap');

:root{
  --orange:#F26522; --orange-deep:#C8480A;
  --dark:#0F0F0F; --dark2:#161616;
  --white:#FFFFFF; --off-white:#F8F8F8;
  --gray:#888; --gray-light:#E8E8E8; --text:#1A1A1A;
  --green:#22A155;
  --ff-head:'Montserrat',sans-serif; --ff-body:'Poppins',sans-serif;
  --tr:all .3s cubic-bezier(.4,0,.2,1);
  --sh:0 8px 32px rgba(0,0,0,.1); --sh-lg:0 20px 60px rgba(0,0,0,.15);
}
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box;}
html{scroll-behavior:smooth;}
body{font-family:var(--ff-body);color:var(--text);background:#fff;overflow-x:hidden;-webkit-font-smoothing:antialiased;}

/* LOADER */
.ldr{position:fixed;inset:0;z-index:9999;background:var(--dark);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;animation:ldrFade .5s 2.4s ease forwards;}
.ldr-logo{width:110px;object-fit:contain;animation:ldrUp .8s .2s ease both;}
.ldr-name{font-family:var(--ff-head);font-size:2.3rem;font-weight:900;color:#fff;letter-spacing:-1px;animation:ldrUp .8s .4s ease both;}
.ldr-name span{color:var(--orange);}
.ldr-bar{width:220px;height:3px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden;}
.ldr-bar::after{content:'';display:block;height:100%;width:0;background:linear-gradient(90deg,var(--orange),#FFAC6E);border-radius:99px;animation:ldrBar 2.1s .5s ease forwards;}
.ldr-sub{font-size:11px;color:rgba(255,255,255,.3);letter-spacing:4px;text-transform:uppercase;animation:ldrUp .8s .6s ease both;}
@keyframes ldrUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes ldrBar{to{width:100%}}
@keyframes ldrFade{to{opacity:0;pointer-events:none}}

/* NAV */
.nav{position:fixed;top:0;left:0;right:0;z-index:500;display:flex;align-items:center;justify-content:space-between;padding:0 6%;height:76px;background:rgba(15,15,15,.93);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.06);transition:var(--tr);}
.nav.scrolled{height:64px;background:rgba(15,15,15,.98);}
.nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none;}
.nav-logo img{height:42px;object-fit:contain;}
.nav-logo-name{font-family:var(--ff-head);font-size:1.4rem;font-weight:900;color:#fff;letter-spacing:-.5px;}
.nav-logo-name span{color:var(--orange);}
.nav-links{display:flex;align-items:center;gap:2px;list-style:none;}
.nav-links a{text-decoration:none;color:rgba(255,255,255,.65);font-size:13px;font-weight:500;padding:7px 14px;border-radius:8px;transition:var(--tr);}
.nav-links a:hover{color:var(--orange);}
.nav-btns{display:flex;gap:10px;align-items:center;}
.btn-ghost{text-decoration:none;color:#fff;font-size:13px;font-weight:600;font-family:var(--ff-head);padding:10px 22px;border-radius:99px;border:1.5px solid rgba(255,255,255,.22);transition:var(--tr);}
.btn-ghost:hover{border-color:#fff;background:rgba(255,255,255,.07);}
.btn-orange-nav{text-decoration:none;background:var(--orange);color:#fff;font-size:13px;font-weight:700;font-family:var(--ff-head);padding:10px 22px;border-radius:99px;box-shadow:0 4px 16px rgba(242,101,34,.35);transition:var(--tr);}
.btn-orange-nav:hover{background:var(--orange-deep);transform:translateY(-2px);}
.nav-ham{display:none;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.12);color:#fff;width:42px;height:42px;border-radius:10px;cursor:pointer;font-size:18px;align-items:center;justify-content:center;transition:var(--tr);}
.nav-ham:hover{background:rgba(255,255,255,.14);}

/* DRAWER */
.drw-ov{position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.72);opacity:0;visibility:hidden;transition:var(--tr);}
.drw-ov.open{opacity:1;visibility:visible;}
.drw{position:absolute;top:0;right:0;width:280px;height:100%;background:var(--dark2);transform:translateX(100%);transition:transform .35s cubic-bezier(.4,0,.2,1);padding:26px;}
.drw-ov.open .drw{transform:none;}
.drw-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:26px;}
.drw-close{background:rgba(255,255,255,.07);border:none;color:#fff;font-size:18px;width:36px;height:36px;border-radius:8px;cursor:pointer;}
.drw nav{display:flex;flex-direction:column;gap:4px;}
.drw nav a{text-decoration:none;color:rgba(255,255,255,.7);font-size:15px;font-weight:500;padding:12px 14px;border-radius:10px;transition:var(--tr);}
.drw nav a:hover{background:rgba(255,255,255,.06);color:#fff;}
.drw-sep{height:1px;background:rgba(255,255,255,.07);margin:12px 0;}
.drw-cta{display:block;background:var(--orange);color:#fff;font-weight:700;font-size:15px;text-align:center;text-decoration:none;padding:14px;border-radius:12px;margin-top:10px;}

/* HERO */
.hero{min-height:100vh;background:var(--dark);position:relative;overflow:hidden;display:grid;grid-template-columns:55% 45%;align-items:center;padding-top:76px;}
.hero-noise{position:absolute;inset:0;pointer-events:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.035'/%3E%3C/svg%3E");background-size:300px;}
.hero-glow{position:absolute;top:-15%;left:-8%;width:650px;height:650px;background:radial-gradient(circle,rgba(242,101,34,.14) 0%,transparent 65%);border-radius:50%;pointer-events:none;}
.hero-glow2{position:absolute;bottom:-20%;right:30%;width:450px;height:450px;background:radial-gradient(circle,rgba(242,101,34,.06) 0%,transparent 65%);border-radius:50%;pointer-events:none;}

/* hero left */
.hero-content{position:relative;z-index:10;padding:80px 6% 80px 8%;display:flex;flex-direction:column;gap:26px;}
.hero-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(242,101,34,.1);border:1px solid rgba(242,101,34,.22);color:#FFAC6E;font-size:11.5px;font-weight:600;font-family:var(--ff-head);letter-spacing:.5px;padding:7px 18px;border-radius:99px;width:fit-content;animation:heroUp .9s .2s ease both;}
.badge-dot{width:7px;height:7px;background:#4ADE80;border-radius:50%;box-shadow:0 0 7px #4ADE80;animation:dotPulse 2s infinite;}
@keyframes dotPulse{0%,100%{opacity:1}50%{opacity:.3}}
.hero-h1{font-family:var(--ff-head);font-size:clamp(2.6rem,4.2vw,4rem);font-weight:900;color:#fff;line-height:1.1;letter-spacing:-1.5px;animation:heroUp .9s .35s ease both;}
.hl-orange{color:var(--orange);display:block;}
.hero-sub{font-size:clamp(.92rem,1.4vw,1.02rem);color:rgba(255,255,255,.55);line-height:1.82;max-width:490px;font-weight:300;animation:heroUp .9s .5s ease both;}
.hero-cta{display:flex;gap:12px;flex-wrap:wrap;animation:heroUp .9s .65s ease both;}
.hero-btn-main{text-decoration:none;background:var(--orange);color:#fff;font-family:var(--ff-head);font-size:14.5px;font-weight:700;padding:15px 34px;border-radius:99px;box-shadow:0 8px 28px rgba(242,101,34,.42);transition:var(--tr);display:inline-flex;align-items:center;gap:8px;}
.hero-btn-main:hover{background:var(--orange-deep);transform:translateY(-3px);box-shadow:0 14px 40px rgba(242,101,34,.55);}
.hero-btn-ghost{text-decoration:none;color:rgba(255,255,255,.82);font-family:var(--ff-head);font-size:14.5px;font-weight:600;padding:15px 34px;border-radius:99px;border:1.5px solid rgba(255,255,255,.18);background:rgba(255,255,255,.04);transition:var(--tr);}
.hero-btn-ghost:hover{background:rgba(255,255,255,.09);transform:translateY(-3px);}
.hero-stats{display:flex;gap:32px;flex-wrap:wrap;animation:heroUp .9s .8s ease both;}
.stat-val{font-family:var(--ff-head);font-size:1.9rem;font-weight:900;color:var(--orange);line-height:1;}
.stat-lbl{font-size:11.5px;color:rgba(255,255,255,.4);margin-top:3px;}
.stat-sep{width:1px;background:rgba(255,255,255,.1);align-self:stretch;}
.hero-social-proof{display:inline-flex;align-items:center;gap:12px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:99px;padding:9px 18px;width:fit-content;animation:heroUp .9s .95s ease both;}
.sp-avatars{display:flex;}
.sp-av{width:30px;height:30px;border-radius:50%;border:2px solid var(--dark);background:linear-gradient(135deg,#FFAC6E,var(--orange));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;margin-left:-8px;}
.sp-av:first-child{margin-left:0;}
.sp-text{font-size:12.5px;color:rgba(255,255,255,.78);font-weight:500;}
.sp-text strong{color:var(--orange);}

/* hero right - banner image */
.hero-img-side{position:relative;height:100vh;overflow:hidden;}
.hero-img-main{width:100%;height:100%;object-fit:cover;object-position:center top;}
.hero-img-overlay{position:absolute;inset:0;background:linear-gradient(90deg,var(--dark) 0%,rgba(15,15,15,.25) 42%),linear-gradient(0deg,var(--dark) 0%,transparent 38%);}

/* floating cards on image */
.hero-fc-top{position:absolute;top:80px;right:20px;background:rgba(15,15,15,.82);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:11px 16px;display:flex;align-items:center;gap:10px;animation:cardPop 1s 1.4s ease both;}
.fc-dot{width:9px;height:9px;background:var(--green);border-radius:50%;box-shadow:0 0 8px var(--green);animation:dotPulse 2s infinite;}
.fc-txt{font-size:12px;color:rgba(255,255,255,.82);font-weight:600;font-family:var(--ff-head);}
.hero-fc-bot{position:absolute;bottom:56px;left:-18px;background:rgba(15,15,15,.82);backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:16px 20px;display:flex;align-items:center;gap:13px;min-width:230px;animation:cardPop 1s 1.2s ease both;}
.fc-icon{font-size:2.1rem;}
.fc-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:2px;font-family:var(--ff-head);}
.fc-sub{font-size:11.5px;color:rgba(255,255,255,.45);}
@keyframes cardPop{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}
@keyframes heroUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:none}}

/* scroll hint */
.scroll-hint{position:absolute;bottom:28px;left:8%;display:flex;align-items:center;gap:8px;color:rgba(255,255,255,.25);font-size:11px;letter-spacing:2px;text-transform:uppercase;z-index:10;}
.scroll-mouse{width:20px;height:32px;border:1.5px solid rgba(255,255,255,.2);border-radius:10px;position:relative;}
.scroll-wheel{position:absolute;top:4px;left:50%;transform:translateX(-50%);width:3px;height:5px;background:rgba(255,255,255,.35);border-radius:2px;animation:wheelA 1.5s ease infinite;}
@keyframes wheelA{0%{top:4px;opacity:1}100%{top:14px;opacity:0}}

/* TRUST BAR */
.trust{background:var(--dark2);border-top:1px solid rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.04);padding:0 6%;}
.trust-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:40px;padding:15px 0;flex-wrap:wrap;}
.trust-item{display:flex;align-items:center;gap:8px;font-size:13px;color:rgba(255,255,255,.48);font-weight:500;}
.trust-sep{width:1px;height:18px;background:rgba(255,255,255,.07);}

/* SECTION SHARED */
.sec-tag{display:inline-block;font-family:var(--ff-head);font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:var(--orange);margin-bottom:10px;}
.sec-h2{font-family:var(--ff-head);font-size:clamp(1.7rem,2.8vw,2.5rem);font-weight:900;color:var(--text);letter-spacing:-.5px;line-height:1.2;margin-bottom:12px;}
.sec-h2 span{color:var(--orange);}
.sec-h2.white{color:#fff;}
.sec-sub{font-size:14.5px;color:var(--gray);line-height:1.82;font-weight:300;}
.sec-sub.white{color:rgba(255,255,255,.5);}
.aos{opacity:0;transform:translateY(26px);transition:opacity .7s ease,transform .7s ease;}
.aos.show{opacity:1;transform:none;}
.aos-l{opacity:0;transform:translateX(-26px);transition:opacity .7s ease,transform .7s ease;}
.aos-l.show{opacity:1;transform:none;}
.aos-r{opacity:0;transform:translateX(26px);transition:opacity .7s ease,transform .7s ease;}
.aos-r.show{opacity:1;transform:none;}

/* WHY */
.why-sec{padding:100px 6%;background:#fff;}
.why-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1.15fr;gap:80px;align-items:center;}
.why-desc{font-size:14.5px;color:var(--gray);line-height:1.9;font-weight:300;max-width:440px;margin-top:14px;}
.why-cards{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
.why-card{border-radius:20px;padding:26px 22px;display:flex;flex-direction:column;gap:12px;background:var(--off-white);border:1.5px solid var(--gray-light);transition:var(--tr);}
.why-card:hover{transform:translateY(-6px);box-shadow:var(--sh);}
.why-card.or{background:var(--orange);border-color:var(--orange);}
.why-card.or .wc-icon{background:rgba(255,255,255,.18);}
.why-card.or .wc-title{color:#fff;}
.why-card.or .wc-text{color:rgba(255,255,255,.82);}
.wc-icon{width:46px;height:46px;border-radius:12px;background:rgba(242,101,34,.1);display:flex;align-items:center;justify-content:center;font-size:1.55rem;}
.wc-title{font-family:var(--ff-head);font-size:15px;font-weight:700;color:var(--text);}
.wc-text{font-size:12.5px;color:var(--gray);line-height:1.7;}

/* MEALS */
.meals-sec{padding:100px 6%;background:#FFF0E8;}
.meals-inner{max-width:1200px;margin:0 auto;}
.meals-head{text-align:center;margin-bottom:56px;}
.meals-head .sec-sub{max-width:480px;margin:0 auto;}
.meals-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-bottom:44px;}
.meal-card{background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.07);border:1.5px solid rgba(0,0,0,.05);transition:var(--tr);}
.meal-card:hover{transform:translateY(-10px);box-shadow:0 20px 50px rgba(0,0,0,.13);}
.meal-img-wrap{position:relative;height:230px;overflow:hidden;background:#f3f3f3;}
.meal-img{width:100%;height:100%;object-fit:cover;transition:transform .5s ease;}
.meal-card:hover .meal-img{transform:scale(1.07);}
.meal-badge{position:absolute;top:13px;right:13px;padding:5px 14px;border-radius:99px;font-size:11px;font-weight:700;font-family:var(--ff-head);}
.meal-badge.veg{background:#22A155;color:#fff;}
.meal-badge.jain{background:#7C3AED;color:#fff;}
.meal-like-btn{position:absolute;top:13px;left:13px;width:34px;height:34px;background:rgba(255,255,255,.9);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer;transition:var(--tr);}
.meal-like-btn:hover{transform:scale(1.15);}
.meal-body{padding:20px 22px 22px;}
.meal-title{font-family:var(--ff-head);font-size:16.5px;font-weight:700;color:var(--text);margin-bottom:7px;}
.meal-desc{font-size:12.5px;color:var(--gray);line-height:1.75;margin-bottom:16px;}
.meal-footer{display:flex;align-items:center;justify-content:space-between;}
.meal-chip{font-size:11px;font-weight:700;color:var(--orange);background:rgba(242,101,34,.1);padding:5px 12px;border-radius:99px;font-family:var(--ff-head);}
.meal-btn{display:inline-flex;align-items:center;gap:5px;text-decoration:none;color:var(--orange);font-size:13px;font-weight:700;font-family:var(--ff-head);padding:8px 18px;border-radius:99px;border:1.5px solid var(--orange);transition:var(--tr);}
.meal-btn:hover{background:var(--orange);color:#fff;}
.meals-cta{text-align:center;}
.btn-lg{display:inline-flex;align-items:center;gap:9px;text-decoration:none;background:var(--orange);color:#fff;font-family:var(--ff-head);font-size:15px;font-weight:700;padding:16px 42px;border-radius:99px;box-shadow:0 8px 28px rgba(242,101,34,.4);transition:var(--tr);}
.btn-lg:hover{background:var(--orange-deep);transform:translateY(-3px);box-shadow:0 14px 40px rgba(242,101,34,.5);}

/* TESTIMONIALS */
.testi-sec{padding:100px 6%;background:#fff;overflow:hidden;}
.testi-inner{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:44% 1fr;gap:64px;align-items:center;}
.testi-visual{position:relative;border-radius:28px;overflow:hidden;}
.testi-main-img{width:100%;height:480px;object-fit:cover;border-radius:28px;display:block;}
.testi-img-overlay{position:absolute;inset:0;border-radius:28px;background:linear-gradient(0deg,rgba(15,15,15,.7) 0%,transparent 55%);}
.testi-img-badge{position:absolute;bottom:24px;left:24px;right:24px;background:rgba(15,15,15,.8);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px 18px;display:flex;align-items:center;gap:12px;}
.tib-icon{font-size:1.8rem;}
.tib-title{font-size:14px;font-weight:700;color:#fff;font-family:var(--ff-head);margin-bottom:2px;}
.tib-sub{font-size:11.5px;color:rgba(255,255,255,.5);}
.testi-spice{position:absolute;font-size:2.2rem;animation:floatSp 5s ease-in-out infinite;}
.testi-spice.s1{top:14px;right:16px;animation-delay:0s;}
.testi-spice.s2{top:14px;left:16px;animation-delay:1.3s;font-size:1.8rem;}
@keyframes floatSp{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(8deg)}}
.testi-content{display:flex;flex-direction:column;gap:28px;}
.testi-card{background:var(--off-white);border:1.5px solid var(--gray-light);border-radius:22px;padding:28px;transition:var(--tr);}
.testi-card.active{background:#fff;box-shadow:var(--sh-lg);border-color:rgba(242,101,34,.18);}
.testi-q{font-size:2.6rem;color:rgba(242,101,34,.12);font-family:Georgia,serif;line-height:1;display:block;margin-bottom:8px;}
.testi-text{font-size:14.5px;color:var(--text);line-height:1.82;font-style:italic;margin-bottom:18px;}
.testi-author{display:flex;align-items:center;justify-content:space-between;}
.testi-info{display:flex;align-items:center;gap:11px;}
.testi-av{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,var(--orange),#FFAC6E);display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:700;color:#fff;font-family:var(--ff-head);flex-shrink:0;}
.testi-name{font-family:var(--ff-head);font-size:13.5px;font-weight:700;color:var(--text);}
.testi-role{font-size:11.5px;color:var(--gray);}
.testi-stars{color:#F59E0B;font-size:13.5px;letter-spacing:.5px;}
.tn-row{display:flex;align-items:center;gap:14px;}
.testi-nav{display:flex;gap:8px;}
.tn-btn{width:40px;height:40px;border-radius:50%;border:1.5px solid var(--gray-light);background:#fff;cursor:pointer;font-size:16px;transition:var(--tr);display:flex;align-items:center;justify-content:center;}
.tn-btn:hover,.tn-btn.on{background:var(--orange);border-color:var(--orange);color:#fff;}
.testi-dots{display:flex;gap:6px;}
.td-dot{width:7px;height:7px;border-radius:99px;background:var(--gray-light);border:none;cursor:pointer;padding:0;transition:var(--tr);}
.td-dot.on{background:var(--orange);width:18px;}

/* PLANS */
.plans-sec{padding:100px 6%;background:var(--dark);position:relative;overflow:hidden;}
.plans-glow{position:absolute;top:-80px;right:-80px;width:460px;height:460px;background:radial-gradient(circle,rgba(242,101,34,.13),transparent);border-radius:50%;pointer-events:none;}
.plans-inner{max-width:980px;margin:0 auto;position:relative;z-index:2;}
.plans-head{text-align:center;margin-bottom:60px;}
.plans-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
.plan-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:24px;padding:36px 26px;text-align:center;position:relative;transition:var(--tr);}
.plan-card:hover{background:rgba(255,255,255,.07);transform:translateY(-8px);}
.plan-card.feat{background:linear-gradient(145deg,var(--orange),var(--orange-deep));border-color:var(--orange);transform:scale(1.03);}
.plan-card.feat:hover{transform:scale(1.03) translateY(-8px);}
.plan-pop{position:absolute;top:-14px;left:50%;transform:translateX(-50%);background:#F59E0B;color:#111;padding:4px 16px;border-radius:99px;font-size:10.5px;font-weight:800;font-family:var(--ff-head);white-space:nowrap;}
.plan-icon{font-size:2.6rem;margin-bottom:10px;display:block;}
.plan-title{font-family:var(--ff-head);font-size:18px;font-weight:800;color:#fff;margin-bottom:18px;}
.plan-price{font-family:var(--ff-head);font-size:2.8rem;font-weight:900;color:var(--orange);line-height:1;}
.plan-card.feat .plan-price{color:#fff;}
.plan-per{font-size:12.5px;color:rgba(255,255,255,.45);margin-bottom:5px;}
.plan-note{font-size:10.5px;color:rgba(255,255,255,.3);font-style:italic;margin-bottom:22px;}
.plan-features{list-style:none;display:flex;flex-direction:column;gap:8px;margin-bottom:26px;text-align:left;}
.plan-features li{font-size:12.5px;color:rgba(255,255,255,.72);padding:8px 11px;background:rgba(255,255,255,.05);border-radius:8px;}
.plan-card.feat .plan-features li{background:rgba(255,255,255,.14);color:rgba(255,255,255,.95);}
.plan-btn{display:block;text-decoration:none;background:var(--orange);color:#fff;font-family:var(--ff-head);font-weight:700;font-size:13.5px;padding:12px;border-radius:99px;transition:var(--tr);}
.plan-btn:hover{background:var(--orange-deep);transform:translateY(-2px);}
.plan-card.feat .plan-btn{background:#fff;color:var(--orange);}
.plan-card.feat .plan-btn:hover{background:rgba(255,255,255,.9);}

/* CTA BAND */
.cta-band{padding:76px 6%;background:var(--orange);text-align:center;position:relative;overflow:hidden;}
.cta-band::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(255,255,255,.1),transparent 65%);}
.cta-band-inner{position:relative;z-index:2;}
.cta-band h2{font-family:var(--ff-head);font-size:clamp(1.7rem,3.2vw,2.6rem);font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:12px;}
.cta-band p{font-size:15.5px;color:rgba(255,255,255,.82);margin-bottom:34px;}
.cta-band-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
.ctb-white{text-decoration:none;background:#fff;color:var(--orange);font-family:var(--ff-head);font-weight:700;font-size:14.5px;padding:15px 38px;border-radius:99px;transition:var(--tr);}
.ctb-white:hover{transform:translateY(-3px);box-shadow:0 14px 36px rgba(0,0,0,.2);}
.ctb-outline{text-decoration:none;background:rgba(255,255,255,.1);color:#fff;font-family:var(--ff-head);font-weight:600;font-size:14.5px;padding:15px 38px;border-radius:99px;border:1.5px solid rgba(255,255,255,.38);transition:var(--tr);}
.ctb-outline:hover{background:rgba(255,255,255,.2);transform:translateY(-3px);}

/* CONTACT */
.contact-sec{padding:100px 6%;background:var(--off-white);}
.contact-inner{max-width:860px;margin:0 auto;}
.contact-head{text-align:center;margin-bottom:52px;}
.contact-card{background:#fff;border:1.5px solid var(--gray-light);border-radius:28px;padding:50px;box-shadow:var(--sh-lg);}
.contact-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:13px;margin-bottom:38px;}
.ci{display:flex;align-items:flex-start;gap:13px;padding:18px;border-radius:15px;background:var(--off-white);border:1.5px solid var(--gray-light);transition:var(--tr);}
.ci:hover{border-color:var(--orange);transform:translateY(-4px);box-shadow:0 10px 26px rgba(242,101,34,.09);}
.ci-icon{width:44px;height:44px;border-radius:11px;background:rgba(242,101,34,.09);display:flex;align-items:center;justify-content:center;font-size:1.25rem;flex-shrink:0;}
.ci-lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:2px;color:var(--gray);margin-bottom:3px;font-family:var(--ff-head);}
.ci-val{font-size:14.5px;font-weight:600;color:var(--text);line-height:1.55;}
.ci-val a{color:var(--orange);text-decoration:none;}
.contact-div{height:1px;background:var(--gray-light);margin:0 0 30px;}
.social-lbl{text-align:center;font-size:10.5px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#aaa;margin-bottom:16px;font-family:var(--ff-head);}
.social-btns{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}
.soc-btn{display:inline-flex;align-items:center;gap:7px;padding:10px 26px;border-radius:99px;font-size:13.5px;font-weight:700;color:#fff;border:none;cursor:pointer;font-family:var(--ff-head);transition:var(--tr);}
.soc-btn.fb{background:#1877F2;}
.soc-btn.tw{background:#0F172A;}
.soc-btn:hover{transform:translateY(-4px);box-shadow:0 10px 22px rgba(0,0,0,.2);}

/* FOOTER */
.footer{background:var(--dark);padding:68px 6% 30px;}
.footer-grid{max-width:1200px;margin:0 auto;display:grid;grid-template-columns:2fr 1fr 1.4fr;gap:56px;padding-bottom:44px;border-bottom:1px solid rgba(255,255,255,.07);}
.footer-brand{display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.footer-brand img{height:48px;object-fit:contain;}
.footer-brand-name{font-family:var(--ff-head);font-size:1.4rem;font-weight:900;color:#fff;}
.footer-brand-name span{color:var(--orange);}
.footer-desc{font-size:13.5px;color:rgba(255,255,255,.4);line-height:1.82;margin-bottom:22px;max-width:290px;}
.footer-socials{display:flex;gap:9px;}
.footer-soc{width:36px;height:36px;border-radius:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);display:flex;align-items:center;justify-content:center;font-size:15px;text-decoration:none;transition:var(--tr);}
.footer-soc:hover{background:var(--orange);border-color:var(--orange);}
.footer-col-title{font-family:var(--ff-head);font-size:12px;font-weight:700;color:var(--orange);letter-spacing:2px;text-transform:uppercase;margin-bottom:18px;}
.footer-links{list-style:none;display:flex;flex-direction:column;gap:9px;}
.footer-links a{text-decoration:none;color:rgba(255,255,255,.45);font-size:13.5px;transition:var(--tr);}
.footer-links a:hover{color:#fff;}
.fci{display:flex;align-items:flex-start;gap:9px;margin-bottom:11px;}
.fci-icon{color:var(--orange);font-size:1.05rem;margin-top:1px;flex-shrink:0;}
.fci-text{font-size:13px;color:rgba(255,255,255,.45);line-height:1.6;}
.footer-bottom{max-width:1200px;margin:26px auto 0;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;}
.footer-bottom p{font-size:12.5px;color:rgba(255,255,255,.22);}
.footer-btm-links{display:flex;gap:18px;}
.footer-btm-links a{text-decoration:none;font-size:12.5px;color:rgba(255,255,255,.22);transition:var(--tr);}
.footer-btm-links a:hover{color:rgba(255,255,255,.55);}

/* RESPONSIVE */
@media(max-width:1024px){
  .hero{grid-template-columns:1fr;}
  .hero-img-side{display:none;}
  .hero-content{padding:80px 6%;max-width:680px;}
  .why-inner{grid-template-columns:1fr;gap:44px;}
  .meals-grid{grid-template-columns:repeat(2,1fr);}
  .testi-inner{grid-template-columns:1fr;gap:44px;}
  .testi-visual{max-width:380px;margin:0 auto;}
  .plans-grid{grid-template-columns:1fr;max-width:360px;margin:0 auto;}
  .plan-card.feat{transform:none;}
  .footer-grid{grid-template-columns:1fr 1fr;gap:36px;}
}
@media(max-width:768px){
  .nav-links,.nav-btns{display:none;}
  .nav-ham{display:flex;}
  .hero-h1{font-size:2.2rem;}
  .hero-stats{gap:18px;}
  .hero-social-proof{display:none;}
  .meals-grid{grid-template-columns:1fr;}
  .contact-card{padding:26px 18px;}
  .contact-grid{grid-template-columns:1fr;}
  .footer-grid{grid-template-columns:1fr;gap:28px;}
  .footer-bottom{flex-direction:column;text-align:center;}
  .cta-band-btns{flex-direction:column;align-items:center;}
  .ctb-white,.ctb-outline{width:100%;max-width:280px;text-align:center;}
}
@media(max-width:480px){
  .hero-h1{font-size:1.9rem;}
  .why-cards{grid-template-columns:1fr;}
  .trust-inner{flex-direction:column;gap:10px;}
}
`;

// ─── COMPONENT ────────────────────────────────────────────────────
export default function LandingPage() {
  const [loading,       setLoading]       = useState(true);
  const [scrolled,      setScrolled]      = useState(false);
  const [drawer,        setDrawer]        = useState(false);
  const [tidx,          setTidx]          = useState(0);
  const [adminContact,  setAdminContact]  = useState(null);

  const trialRef = () => localStorage.setItem('trialIntent', 'true');

  useEffect(() => {
    fetch('/api/admin/public-contact')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch contact info');
        return r.json();
      })
      .then(setAdminContact)
      .catch(() => {
        // Use fallback contact — page still renders correctly
        setAdminContact({ email: 'support@mealsetu.com', phone: '' });
      });
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    if (loading) return;
    const io = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('show'); }),
      { threshold: 0.1 }
    );
    document.querySelectorAll('.aos,.aos-l,.aos-r').forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [loading]);

  useEffect(() => {
    const t = setInterval(() => setTidx(i => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(t);
  }, []);

  // ── LOADER ──────────────────────────────────────────────────────
  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="ldr">
        <img src={logo} alt="MealSetu" className="ldr-logo" />
        <div className="ldr-name">Meal<span>Setu</span></div>
        <div className="ldr-bar" />
        <div className="ldr-sub">Tiffin Service · Navsari</div>
      </div>
    </>
  );

  // ── PAGE ────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      {/* ─ DRAWER ─ */}
      <div className={`drw-ov${drawer ? ' open' : ''}`} onClick={() => setDrawer(false)}>
        <div className="drw" onClick={e => e.stopPropagation()}>
          <div className="drw-head">
            <img src={logo} alt="MealSetu" style={{ height: 40, objectFit: 'contain' }} />
            <button className="drw-close" onClick={() => setDrawer(false)}>✕</button>
          </div>
          <nav>
            {[['#home','Home'],['#why','About Us'],['#meals','Our Meals'],['#plans','Pricing'],['#testimonials','Reviews'],['#contact','Contact']].map(([h, l]) => (
              <a key={h} href={h} onClick={() => setDrawer(false)}>{l}</a>
            ))}
            <div className="drw-sep" />
            <Link to="/login" onClick={() => setDrawer(false)}
              style={{ textDecoration: 'none', color: 'rgba(255,255,255,.7)', fontSize: 15, fontWeight: 500, padding: '12px 14px', borderRadius: 10, display: 'block' }}>
              Login
            </Link>
          </nav>
          <Link to="/login" className="drw-cta" onClick={() => { trialRef(); setDrawer(false); }}>
            🎉 Start Free Trial
          </Link>
        </div>
      </div>

      {/* ─ NAV ─ */}
      <nav className={`nav${scrolled ? ' scrolled' : ''}`}>
        <a href="#home" className="nav-logo">
          <img src={logo} alt="MealSetu" />
          <span className="nav-logo-name">Meal<span>Setu</span></span>
        </a>
        <ul className="nav-links">
          {[['#home','Home'],['#why','About'],['#meals','Meals'],['#plans','Pricing'],['#testimonials','Reviews'],['#contact','Contact']].map(([h, l]) => (
            <li key={h}><a href={h}>{l}</a></li>
          ))}
        </ul>
        <div className="nav-btns">
          <Link to="/login"    className="btn-ghost">🔐 Login</Link>
          <Link to="/login"    className="btn-orange-nav" onClick={trialRef}>Order Now</Link>
        </div>
        <button className="nav-ham" onClick={() => setDrawer(true)}>☰</button>
      </nav>

      {/* ─ HERO ─ */}
      <section id="home" className="hero">
        <div className="hero-noise" />
        <div className="hero-glow" />
        <div className="hero-glow2" />

        {/* Left */}
        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot" />
            Now Serving in Navsari City
          </div>

          <h1 className="hero-h1">
            Freshly Cooked.<br />
            <span className="hl-orange">Lovingly Packed.</span><br />
            Delivered Daily.
          </h1>

          <p className="hero-sub">
            Experience the authentic taste of home-cooked meals delivered right to your
            doorstep in Navsari. Healthy, delicious, and made with love — just like your
            mom's kitchen.
          </p>

          <div className="hero-cta">
            <Link to="/login" className="hero-btn-main" onClick={trialRef}>
              🍱 Check Weekly Menu
            </Link>
            <Link to="/register" className="hero-btn-ghost">
              🚀 Join as Vendor →
            </Link>
          </div>

          <div className="hero-social-proof">
            <div className="sp-avatars">
              {['P', 'R', 'K', 'M'].map((c, i) => <div key={i} className="sp-av">{c}</div>)}
            </div>
            <span className="sp-text"><strong>200+</strong> Happy Customers in Navsari</span>
          </div>

          <div className="hero-stats">
            {[['Navsari','City We Serve'],['₹80+','Starting/Day'],['Daily','Fresh Meals'],['Free','2-Day Trial']].map(([v, l], i) => (
              <React.Fragment key={i}>
                {i > 0 && <div className="stat-sep" />}
                <div>
                  <div className="stat-val">{v}</div>
                  <div className="stat-lbl">{l}</div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right — uses your banner1.png */}
        <div className="hero-img-side">
          <img src={banner1} alt="Fresh Indian tiffin meal" className="hero-img-main" />
          <div className="hero-img-overlay" />

          {/* top-right floating badge */}
          <div className="hero-fc-top">
            <div className="fc-dot" />
            <div className="fc-txt">Live Orders Running</div>
          </div>

          {/* bottom-left floating card */}
          <div className="hero-fc-bot">
            <div className="fc-icon">🍱</div>
            <div>
              <div className="fc-title">Today's Special Tiffin</div>
              <div className="fc-sub">Dal · Roti · Rice · Sabji · Achaar</div>
            </div>
          </div>
        </div>

        <div className="scroll-hint">
          <div className="scroll-mouse"><div className="scroll-wheel" /></div>
          <span>Scroll</span>
        </div>
      </section>

      {/* ─ TRUST BAR ─ */}
      <div className="trust">
        <div className="trust-inner">
          {[['✅','FSSAI Verified'],['🌿','Veg & Jain Options'],['⏸️','Pause Anytime'],['💳','Cash or UPI'],['⭐','Customer Rated']].map(([icon, txt], i) => (
            <React.Fragment key={txt}>
              {i > 0 && <div className="trust-sep" />}
              <div className="trust-item"><span>{icon}</span>{txt}</div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ─ WHY US ─ */}
      <section id="why" className="why-sec">
        <div className="why-inner">
          <div className="aos-l">
            <span className="sec-tag">WHY MEALSETU</span>
            <h2 className="sec-h2">Why Choose <span>MealSetu</span>?</h2>
            <p className="why-desc">
              At MealSetu, we take pride in delivering not just food, but an experience
              that reminds you of home. Handcrafted daily in verified home kitchens, our
              tiffins bring you fresh, wholesome meals with ever-changing menus.
            </p>
          </div>
          <div className="why-cards aos-r">
            {[
              { icon: '🥗', title: 'Veg / Jain Options',  text: 'Choose from vegetarian or pure Jain meals prepared daily with fresh local ingredients.', or: false },
              { icon: '🛡️', title: 'Hygiene First',       text: 'All our kitchens are FSSAI verified. We maintain the highest standards of food safety.',  or: true  },
              { icon: '📅', title: 'Weekly Menu',          text: 'Enjoy different meals every day with our rotating weekly menu of authentic dishes.',       or: true  },
              { icon: '🚴', title: 'Local Delivery',       text: 'Convenient and timely delivery across Navsari. Fresh meals at your doorstep daily.',       or: false },
            ].map((c, i) => (
              <div key={i} className={`why-card${c.or ? ' or' : ''}`}>
                <div className="wc-icon">{c.icon}</div>
                <div className="wc-title">{c.title}</div>
                <div className="wc-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ MEALS ─ */}
      <section id="meals" className="meals-sec">
        <div className="meals-inner">
          <div className="meals-head">
            <span className="sec-tag">OUR MENU</span>
            <h2 className="sec-h2">Our <span>Featured</span> Meals</h2>
            <p className="sec-sub">Discover our most loved dishes that keep our customers coming back for more. Made fresh every single day.</p>
          </div>

          <div className="meals-grid">
            {MEALS.map((m, i) => (
              <div key={i} className="meal-card aos" style={{ transitionDelay: `${i * 0.12}s` }}>
                <div className="meal-img-wrap">
                  {/* ← your local images: thali2.png, thali3.png, image.png */}
                  <img src={m.img} alt={m.title} className="meal-img" loading="lazy" />
                  <span className={`meal-badge ${m.badge}`}>
                    {m.badge === 'veg' ? 'Pure Veg' : 'Pure Jain'}
                  </span>
                  <div className="meal-like-btn">❤️</div>
                </div>
                <div className="meal-body">
                  <div className="meal-title">{m.title}</div>
                  <div className="meal-desc">{m.desc}</div>
                  <div className="meal-footer">
                    <span className="meal-chip">
                      {m.badge === 'jain' ? '🟣 Jain' : '🟢 Veg'}
                    </span>
                    <Link to="/login" className="meal-btn" onClick={trialRef}>View →</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="meals-cta">
            <Link to="/login" className="btn-lg" onClick={trialRef}>View Full Menu →</Link>
          </div>
        </div>
      </section>

      {/* ─ TESTIMONIALS ─ */}
      <section id="testimonials" className="testi-sec">
        <div className="testi-inner">
          {/* visual — thali2.png */}
          <div className="testi-visual aos-l">
            <img src={thali2} alt="Delicious tiffin" className="testi-main-img" />
            <div className="testi-img-overlay" />
            <div className="testi-img-badge">
              <div className="tib-icon">🍱</div>
              <div>
                <div className="tib-title">200+ Happy Customers</div>
                <div className="tib-sub">Served daily across Navsari</div>
              </div>
            </div>
            <div className="testi-spice s1">🌿</div>
            <div className="testi-spice s2">🧄</div>
          </div>

          <div className="testi-content aos-r">
            <div>
              <span className="sec-tag">WHAT THEY SAY</span>
              <h2 className="sec-h2">What Our <span>Customers</span> Say</h2>
            </div>

            {TESTIMONIALS.map((t, i) => (
              <div key={i} className={`testi-card${i === tidx ? ' active' : ''}`} style={{ display: i === tidx ? 'block' : 'none' }}>
                <span className="testi-q">"</span>
                <p className="testi-text">{t.text}</p>
                <div className="testi-author">
                  <div className="testi-info">
                    <div className="testi-av">{t.initials}</div>
                    <div>
                      <div className="testi-name">{t.name}</div>
                      <div className="testi-role">{t.role}</div>
                    </div>
                  </div>
                  <div>
                    <div className="testi-stars">{'★'.repeat(t.rating)}</div>
                    <div style={{ fontSize: 11, color: '#aaa', textAlign: 'right' }}>{t.rating}.0</div>
                  </div>
                </div>
              </div>
            ))}

            <div className="tn-row">
              <div className="testi-nav">
                <button className="tn-btn" onClick={() => setTidx(i => (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length)}>‹</button>
                <button className="tn-btn on" onClick={() => setTidx(i => (i + 1) % TESTIMONIALS.length)}>›</button>
              </div>
              <div className="testi-dots">
                {TESTIMONIALS.map((_, i) => (
                  <button key={i} className={`td-dot${i === tidx ? ' on' : ''}`} onClick={() => setTidx(i)} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─ PLANS ─ */}
      <section id="plans" className="plans-sec">
        <div className="plans-glow" />
        <div className="plans-inner">
          <div className="plans-head">
            <span className="sec-tag" style={{ color: 'rgba(255,165,100,.9)' }}>PRICING</span>
            <h2 className="sec-h2 white">Simple, Transparent <span>Plans</span></h2>
            <p className="sec-sub white">Vendors set their own final prices — always honest and transparent.</p>
          </div>
          <div className="plans-grid">
            {[
              { icon: '☀️', title: 'Daily Plan',   price: '₹80',   per: '/day',   note: 'Vendor sets final price', features: ['1 fresh meal/day', 'Regular or Jain',    'Pay as you go',    'No commitment'], feat: false },
              { icon: '📅', title: 'Weekly Plan',  price: '₹500',  per: '/week',  note: 'Vendor sets final price', features: ['7 meals/week',     'Regular or Jain',    'Better value',     'Pause anytime'],  feat: true  },
              { icon: '🗓️', title: 'Monthly Plan', price: '₹1,800', per: '/month', note: 'Vendor sets final price', features: ['Daily all month',  'Regular or Jain',    'Best value plan',  'Leave mgmt'],    feat: false },
            ].map((p, i) => (
              <div key={i} className={`plan-card${p.feat ? ' feat' : ''} aos`} style={{ transitionDelay: `${i * 0.12}s` }}>
                {p.feat && <div className="plan-pop">Most Popular</div>}
                <span className="plan-icon">{p.icon}</span>
                <div className="plan-title">{p.title}</div>
                <div className="plan-price">{p.price}</div>
                <div className="plan-per">starting from {p.per}</div>
                <div className="plan-note">{p.note}</div>
                <ul className="plan-features">{p.features.map(f => <li key={f}>✓ {f}</li>)}</ul>
                <Link to="/login" className="plan-btn" onClick={trialRef}>Get Started</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─ CTA BAND ─ */}
      <section className="cta-band">
        <div className="cta-band-inner">
          <h2>Ready to enjoy fresh meals every day?</h2>
          <p>Join hundreds of people in Navsari who already eat better with MealSetu.</p>
          <div className="cta-band-btns">
            <Link to="/login"    className="ctb-white"   onClick={trialRef}>🎉 Start Free Trial</Link>
            <Link to="/register" className="ctb-outline">🚀 Register as Vendor</Link>
          </div>
        </div>
      </section>

      {/* ─ CONTACT ─ */}
      <section id="contact" className="contact-sec">
        <div className="contact-inner">
          <div className="contact-head aos">
            <span className="sec-tag">GET IN TOUCH</span>
            <h2 className="sec-h2">Contact <span>Us</span></h2>
            <p className="sec-sub">We are based in Navsari. Reach out anytime.</p>
          </div>
          <div className="contact-card aos">
            <div className="contact-grid">
              <div className="ci">
                <div className="ci-icon">🕐</div>
                <div><div className="ci-lbl">Available Hours</div><div className="ci-val">9 AM – 9 PM<br />Monday to Saturday</div></div>
              </div>
              <div className="ci">
                <div className="ci-icon">✉️</div>
                <div><div className="ci-lbl">Email</div><div className="ci-val"><a href={`mailto:${adminContact?.email || 'support@mealsetu.com'}`}>{adminContact?.email || 'support@mealsetu.com'}</a></div></div>
              </div>
              {adminContact?.name  && <div className="ci"><div className="ci-icon">👤</div><div><div className="ci-lbl">Contact Person</div><div className="ci-val">{adminContact.name}</div></div></div>}
              {adminContact?.phone && <div className="ci"><div className="ci-icon">📞</div><div><div className="ci-lbl">Phone</div><div className="ci-val">{adminContact.phone}</div></div></div>}
            </div>
            <div className="contact-div" />
            <div className="social-lbl">Connect With Us</div>
            <div className="social-btns">
              <button className="soc-btn fb" onClick={() => window.open('https://www.facebook.com', '_blank')}>f Facebook</button>
              <button className="soc-btn tw" onClick={() => window.open('https://www.twitter.com',  '_blank')}>𝕏 Twitter</button>
            </div>
          </div>
        </div>
      </section>

      {/* ─ FOOTER ─ */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src={logo} alt="MealSetu" />
              <span className="footer-brand-name">Meal<span>Setu</span></span>
            </div>
            <p className="footer-desc">Connecting local kitchen vendors with hungry customers across Navsari. Fresh, home-cooked food delivered daily to your doorstep.</p>
            <div className="footer-socials">
              <a href="https://facebook.com"  target="_blank" rel="noreferrer" className="footer-soc">📘</a>
              <a href="https://twitter.com"   target="_blank" rel="noreferrer" className="footer-soc">𝕏</a>
              <a href="https://instagram.com" target="_blank" rel="noreferrer" className="footer-soc">📸</a>
              <a href="https://wa.me"         target="_blank" rel="noreferrer" className="footer-soc">💬</a>
            </div>
          </div>
          <div>
            <div className="footer-col-title">Quick Links</div>
            <ul className="footer-links">
              {[['#home','Home'],['#why','About Us'],['#meals','Our Meals'],['#plans','Pricing'],['#contact','Contact']].map(([h, l]) => (
                <li key={h}><a href={h}>{l}</a></li>
              ))}
              <li><Link to="/login" style={{ textDecoration: 'none', color: 'rgba(255,255,255,.45)', fontSize: 13.5 }}>Login / Register</Link></li>
            </ul>
          </div>
          <div>
            <div className="footer-col-title">Get In Touch</div>
            <div className="fci"><span className="fci-icon">📍</span><span className="fci-text">Navsari, Gujarat, India</span></div>
            <div className="fci"><span className="fci-icon">✉️</span><span className="fci-text">{adminContact?.email || 'support@mealsetu.com'}</span></div>
            {adminContact?.phone && <div className="fci"><span className="fci-icon">📞</span><span className="fci-text">{adminContact.phone}</span></div>}
            <div className="fci"><span className="fci-icon">🕐</span><span className="fci-text">Mon–Sat: 9 AM – 9 PM</span></div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© 2026 MealSetu · MCA Sem-2 Project · Navsari, Gujarat</p>
          <div className="footer-btm-links">
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
      </footer>
    </>
  );
}