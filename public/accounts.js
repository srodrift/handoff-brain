/* Demo accounts for Handoff Brain.
   Fictionalized from real onboarding calls: every clinic, person, phone number, email and vendor name is invented.
   "Northwind" is a fictional phone + texting platform for clinics. */
window.HANDOFF = {
  from: { name: "Maya Chen", role: "Onboarding Consultant", reason: "moving to the Enterprise team on Friday" },
  to:   { name: "You", role: "Onboarding Consultant" },
  journey: ["Kickoff", "Data sync", "Texting registration", "Number port", "Phone install", "Training", "Check-ins"],
};

window.ACCOUNTS = [
{
  id: "lakeview",
  clinic: "Lakeview Family Dental",
  location: "Queens, NY",
  crm: { address: "42-18 Bell Blvd, Bayside, Queens, NY 11361", main_line: "(718) 555-0142", primary_contact: "Rosa (Office manager)", source: "Salesforce account record" },
  calls: [
    { date: "May 6", title: "Platform setup: texting registration, data sync, phones", minutes: 52, transcript:
`Maya: So Rosa, I see you already had Northwind on an old account. Are we continuing on that one?
Rosa: I'm assuming so. The problem before was the business name. When they registered us, "Lakeview Family Dental" was in there twice and there was a parenthesis somewhere. The IRS has it one way and we had it another.
Maya: Got it. A small letter or a parenthesis can hold up the whole registration. Let's start texting registration now. 10DLC is the carrier rule: every business that texts has to register its brand and number, or reminders and missed-call texts get filtered as spam.
Rosa: We always do verbal opt-in.
Maya: Verbal is the fastest. Approval takes about one to one and a half weeks.
Maya: Now the data sync. Your practice software is Dentrix?
Rosa: G5, or G6, I'm not sure.
Maya: The sync app has to go on the server where Dentrix lives. ... The installer is throwing an error, so I submitted a ticket to our tech team. That's normal. ... Okay, David finished it. It was actually Dentrix G7. Your patients are syncing now.
Maya: Let's test a text. ... It didn't go through.
Rosa: See, this is exactly what happened before. We couldn't send any messages, even after using it for a while. That's why I'm scared it won't work again.
Rosa: I told them I want to make sure it actually works before I cancel everything, because I'm already scheduled to cancel my current provider in two weeks.
Rosa: Should I just make a whole new account? I'm hesitant.
Maya: Let me check on that. Right after this call I'll find out the status of your account and send you a confirmation that texting will work once registration is approved.
Rosa: We also have such a high volume of calls and only one receptionist. I want callers in a queue so they hear they're fourth in line.
Maya: Absolutely, we'll set up the call queue on your phone installation day.
Maya: Last thing, the port. Main line and fax?
Rosa: Both. But we don't get phone bills, it's bundled with another service and it's on auto pay. I'll try to get an invoice tomorrow and email you.
Maya: I'll send you an email with the checklist: carrier PIN, account number, service address, and a recent bill. Port date requested for the 22nd.
Rosa: When you find out about that 10 whatever thing for the messaging, please let me know.` }
  ],
  prepared: {
    health: "red",
    health_reason: "Texting failed again on the setup call, and Rosa cancels her current provider in 2 weeks. If texting isn't confirmed before then, this account churns.",
    stage: "Texting registration",
    facts: { pms: "Dentrix G7", integration: "yes", plan: "Phones + texting", addons: ["Call queue requested"], contacts: [{name:"Rosa", role:"Office manager"}], it: "Has server access in office" },
    journey: [
      {step:"Kickoff", status:"done", note:"Returning customer on an old account"},
      {step:"Data sync", status:"done", note:"Dentrix G7 synced after a tech-team ticket"},
      {step:"Texting registration", status:"blocked", note:"Submitted (verbal opt-in); test text failed. Same failure that made them cancel before."},
      {step:"Number port", status:"blocked", note:"Main + fax requested for the 22nd. No phone bill: billing is bundled."},
      {step:"Phone install", status:"todo", note:"4 phones received. Not scheduled yet."},
      {step:"Training", status:"todo", note:""},
      {step:"Check-ins", status:"todo", note:""}
    ],
    where_it_stands: [
      "Patient data is syncing; texting is registered but not working yet.",
      "Rosa is anxious: texting failed on the old account and she nearly left over it.",
      "Port is stuck until she finds an invoice from a bundled bill."
    ],
    risks: [
      {text:"Churn risk: she cancels her current provider in 2 weeks and texting still fails.", quote:"I'm already scheduled to cancel my current provider in two weeks.", call:"May 6"},
      {text:"Brand name mismatch with IRS caused the last texting rejection and may again.", quote:"\"Lakeview Family Dental\" was in there twice and there was a parenthesis somewhere.", call:"May 6"},
      {text:"Port can't be submitted without a bill; billing is bundled on auto pay.", quote:"We don't get phone bills, it's bundled with another service.", call:"May 6"}
    ],
    promises: [
      {who:"us", text:"Find out why texting fails on the old account and confirm it will work.", due:"Overdue: right after the May 6 call", quote:"Right after this call I'll find out the status of your account and send you a confirmation.", call:"May 6"},
      {who:"us", text:"Email the port checklist (carrier PIN, account number, service address, bill).", due:"May 7", quote:"I'll send you an email with the checklist.", call:"May 6"},
      {who:"us", text:"Set up a call queue on phone installation day.", due:"Phone install", quote:"Absolutely, we'll set up the call queue on your phone installation day.", call:"May 6"},
      {who:"customer", text:"Find an invoice and email it for the port.", due:"May 7", quote:"I'll try to get an invoice tomorrow and email you.", call:"May 6"}
    ],
    next_call: [
      "Open with the texting status before anything else. That is what she's worried about.",
      "Check the brand name against the IRS letter exactly (no duplicate name, no parentheses).",
      "Decide old account vs new account with her, so she stops worrying about it.",
      "Ask whether the invoice came through; offer the bundled provider's account portal as an alternative.",
      "Book the phone installation and plan the call queue (high volume, one receptionist)."
    ],
    summary_60s: "Lakeview Family Dental is your most urgent account. Rosa is a returning customer who left before because texting never worked. On the May 6 setup call, patient data synced fine, but a test text failed again, and she cancels her current provider in two weeks. Maya promised to confirm texting status right after that call, and that promise is still open. The likely cause is the brand name not matching the IRS record. The port is also stuck because her phone bill is bundled. On your first call, lead with texting, then the port, then book phone installation with a call queue."
  }
},
{
  id: "brightsmiles",
  clinic: "Bright Smiles Dental Group",
  location: "Arlington, VA",
  crm: { address: "2100 Clarendon Blvd, Suite 300, Arlington, VA 22201", main_line: "(703) 555-0187", primary_contact: "Carla (Front desk)", source: "Salesforce account record" },
  calls: [
    { date: "Mar 4", title: "AI receptionist kickoff", minutes: 38, transcript:
`Maya: Hi Carla, this is the kickoff call for the AI receptionist. Onboarding takes four to five weeks with four scheduled calls: kickoff, training, then two check-ins.
Carla: Okay. I don't know where the server is. It's in a closet. Our IT company handles all of that.
Maya: That's fine, the integration doesn't have to happen on this call. Who is your IT company?
Carla: Ridgeline Tech.
Maya: I'll call them right after this call to set up the integration. What's your practice software?
Carla: Eaglesoft.
Maya: Appointment types: new patient exam and cleaning, adult and child, existing patient exams, new and existing emergencies, Invisalign consult, cosmetic consult. No implants, no sleep apnea.
Carla: Also fillings and crowns for existing treatment. A lot of times we call patients back about insurance pre-approvals, and when they call back the AI should know why.
Maya: Providers?
Carla: Dr. L is pediatric, Thursdays 9 to 5, lunch 12 to 1. Dr. P is ortho, Tuesdays and Wednesdays 9 to 5, lunch 1 to 2. Dr. O is general, Monday 9 to 5, Tuesday and Thursday 9 to 4, Friday 9 to 3. Hygienists rotate, we don't have a permanent one.
Maya: Then I'll set hygiene as generic cleaning appointments.
Maya: Training call: Friday March 27 at 12 pm Eastern.
Carla: I'm excited, can't wait for the next step.` }
  ],
  prepared: {
    health: "amber",
    health_reason: "Happy customer, but nothing works until the IT company installs the integration, and training is booked for March 27.",
    stage: "Data sync",
    facts: { pms: "Eaglesoft", integration: "pending", plan: "AI receptionist", addons: [], contacts: [{name:"Carla", role:"Front desk"},{name:"Ridgeline Tech", role:"Outside IT"}], it: "Server managed by Ridgeline Tech" },
    journey: [
      {step:"Kickoff", status:"done", note:"Mar 4. Appointment types and provider schedules captured."},
      {step:"Data sync", status:"in_progress", note:"Waiting on outside IT (Ridgeline Tech) for server access."},
      {step:"Texting registration", status:"todo", note:""},
      {step:"Number port", status:"todo", note:""},
      {step:"Phone install", status:"todo", note:""},
      {step:"Training", status:"todo", note:"Booked: Fri Mar 27, 12 pm ET"},
      {step:"Check-ins", status:"todo", note:"2 check-ins after training"}
    ],
    where_it_stands: [
      "Kickoff done; appointment types and 3 provider schedules are captured.",
      "Integration depends on Ridgeline Tech, the outside IT company.",
      "Special request: the AI must know about insurance pre-approval callbacks."
    ],
    risks: [
      {text:"Training on Mar 27 will fail if Eaglesoft isn't integrated by then.", quote:"I don't know where the server is. It's in a closet. Our IT company handles all of that.", call:"Mar 4"},
      {text:"Rotating hygienists: schedule set as generic cleaning; confirm the AI books correctly.", quote:"Hygienists rotate, we don't have a permanent one.", call:"Mar 4"}
    ],
    promises: [
      {who:"us", text:"Call Ridgeline Tech to set up the Eaglesoft integration.", due:"Mar 4 (right after kickoff)", quote:"I'll call them right after this call to set up the integration.", call:"Mar 4"},
      {who:"us", text:"Configure insurance pre-approval callback handling.", due:"Before training", quote:"When they call back the AI should know why.", call:"Mar 4"},
      {who:"us", text:"Run training on Fri Mar 27 at 12 pm ET.", due:"Mar 27", quote:"Training call: Friday March 27 at 12 pm Eastern.", call:"Mar 4"}
    ],
    next_call: [
      "Confirm with Ridgeline Tech that the integration is done before Mar 27.",
      "Double-check Dr. O's split schedule (Mon 9–5, Tue/Thu 9–4, Fri 9–3).",
      "Show how pre-approval callbacks are handled; it's what Carla cares about most."
    ],
    summary_60s: "Bright Smiles Dental Group is a friendly AI receptionist account. Kickoff was March 4 with Carla. Everything is captured: appointment types and three provider schedules. The one dependency is their outside IT company, Ridgeline Tech, which controls the server. Maya promised to call them right after kickoff to set up the Eaglesoft integration. Confirm that happened, because training is booked for Friday March 27 at noon Eastern and won't work without the integration. Carla's top request is that the AI understands insurance pre-approval callbacks."
  }
},
{
  id: "summit",
  clinic: "Summit Dental Arts",
  location: "Fremont, CA",
  crm: { address: "39150 Paseo Padre Pkwy, Fremont, CA 94538", main_line: "(510) 555-0163", primary_contact: "Office manager (not named)", source: "Salesforce account record" },
  calls: [
    { date: "Mar 30", title: "Phone installation prep with a senior onboarder", minutes: 31, transcript:
`Lena (senior): How many phones are they doing?
Maya: Five. All corded, T85s, from the quote in Salesforce.
Lena: Start the call with a remote session and run the network audit in the background right away. The audit link has been broken lately, so if it fails do a manual speed test and screenshot it into the account.
Maya: Did a test: about 88 down, 30 up.
Lena: Upload is a little low.
Lena: Unlock provisioning for all phones before they plug in, it lasts an hour. If phones won't provision, it's usually their firewall. Send the network recommendation email to their IT.
Lena: Their call routing shows zero devices in the call group. Configure routing before call forwarding or calls will loop with nowhere to go. Add a fallback: repeat the phone tree.
Maya: I haven't done the port yet. Can I do it on this call?
Lena: Absolutely. Get their current provider account info and most recent bill and submit the port request.
Lena: Then test transfer, hold, park, and dial 933 to confirm the 911 address. Pair the phones to the app for caller pop-ups.` }
  ],
  prepared: {
    health: "amber",
    health_reason: "On track, but the port isn't submitted and call routing has no devices, so forwarding would loop.",
    stage: "Phone install",
    facts: { pms: "Not discussed", integration: "pending", plan: "Phones", addons: [], contacts: [{name:"Office manager", role:"Not named in notes"}], it: "Possible firewall restrictions" },
    journey: [
      {step:"Kickoff", status:"done", note:""},
      {step:"Data sync", status:"todo", note:"Not mentioned in notes"},
      {step:"Texting registration", status:"todo", note:""},
      {step:"Number port", status:"todo", note:"Not submitted. Do it during phone install."},
      {step:"Phone install", status:"in_progress", note:"5 corded phones. Routing has 0 devices."},
      {step:"Training", status:"todo", note:""},
      {step:"Check-ins", status:"todo", note:""}
    ],
    where_it_stands: [
      "Five corded phones shipped; installation call is next.",
      "Call routing exists but has zero devices assigned.",
      "Network upload speed is low (about 30 Mbps)."
    ],
    risks: [
      {text:"Call forwarding before routing is set up will loop calls.", quote:"Configure routing before call forwarding or calls will loop with nowhere to go.", call:"Mar 30"},
      {text:"Port not submitted yet; it takes about two weeks.", quote:"I haven't done the port yet.", call:"Mar 30"}
    ],
    promises: [
      {who:"us", text:"Submit the port request during the install call.", due:"Install call", quote:"Get their current provider account info and most recent bill and submit the port request.", call:"Mar 30"}
    ],
    next_call: [
      "Remote session first; run the network audit in the background (manual speed test if the link fails).",
      "Unlock provisioning for all phones, then plug in and rename each device.",
      "Assign devices to the call group and add a fallback before forwarding.",
      "Submit the port request with the latest bill.",
      "Test transfer, hold, park, and dial 933 to check the 911 address."
    ],
    summary_60s: "Summit Dental Arts is ready for phone installation: five corded phones. Two things to know. First, call routing exists but has zero devices, so set up routing before any call forwarding or calls will loop. Second, the number port was never submitted, so do it on the install call with their latest bill. Start the call with a remote session and the network audit; upload speed was low, around 30 megabits. Then provision, rename, test transfer, hold, park, and 933."
  }
},
{
  id: "peak",
  clinic: "Peak Motion Physical Therapy",
  location: "Denver, CO",
  crm: { address: "1550 Larimer St, Denver, CO 80202", main_line: "(303) 555-0119", primary_contact: "Megan (Practice manager)", source: "Salesforce account record" },
  calls: [
    { date: "May 20", title: "Kickoff: integration expectations", minutes: 24, transcript:
`Maya: Your practice software is ClinicFlow? We don't have a direct integration with ClinicFlow, so patient data comes in through CSV uploads.
Megan: Wait, the rep at the conference told us it integrates. I thought it would be seamless.
Maya: I'm sorry, I wasn't part of the sales conversation. Let me follow up with the sales team and have them reach out.
Megan: And how much is this costing us? What's my cost?
Maya: Your account executive handles pricing. I'll loop them in.
Maya: I'll show you how the CSV upload works. Other offices on the same software use it and they're happy with it. We also add new integrations often.
Megan: Okay. It's fine, I just wish we'd known.` }
  ],
  prepared: {
    health: "red",
    health_reason: "Expectation gap: the customer was told it integrates; it doesn't. Pricing questions are also unanswered.",
    stage: "Data sync",
    facts: { pms: "ClinicFlow", integration: "csv", plan: "Unknown (ask account executive)", addons: [], contacts: [{name:"Megan", role:"Practice manager"}], it: "" },
    journey: [
      {step:"Kickoff", status:"done", note:"May 20. Learned there's no integration."},
      {step:"Data sync", status:"in_progress", note:"CSV uploads instead of integration"},
      {step:"Texting registration", status:"todo", note:""},
      {step:"Number port", status:"todo", note:""},
      {step:"Phone install", status:"todo", note:""},
      {step:"Training", status:"todo", note:""},
      {step:"Check-ins", status:"todo", note:""}
    ],
    where_it_stands: [
      "Megan was told at a conference that their software integrates. It doesn't.",
      "Data will come in through CSV uploads.",
      "Pricing questions went unanswered and were handed to the account executive."
    ],
    risks: [
      {text:"Customer feels misled about the integration.", quote:"The rep at the conference told us it integrates. I thought it would be seamless.", call:"May 20"},
      {text:"Open pricing question can turn into a cancellation request.", quote:"How much is this costing us?", call:"May 20"}
    ],
    promises: [
      {who:"us", text:"Have sales reach out about the integration expectation.", due:"This week", quote:"Let me follow up with the sales team and have them reach out.", call:"May 20"},
      {who:"us", text:"Loop in the account executive on pricing.", due:"This week", quote:"I'll loop them in.", call:"May 20"}
    ],
    next_call: [
      "Confirm sales and the account executive actually reached out.",
      "Walk through the CSV upload step by step and set a weekly upload reminder.",
      "Stay neutral about the sales conversation; focus on the value they get now."
    ],
    summary_60s: "Peak Motion Physical Therapy is red because of an expectation gap, not a technical problem. Megan was told at a conference that their software, ClinicFlow, integrates. It doesn't, so data comes in by CSV upload. She also asked about pricing, which goes to the account executive. Maya promised to have sales and the account executive reach out. Check that happened before your next call, then make the CSV upload easy and routine."
  }
},
{
  id: "harbor",
  clinic: "Harbor Point Orthodontics",
  location: "Tampa, FL",
  crm: { address: "401 Channelside Dr, Tampa, FL 33602", main_line: "(813) 555-0175", primary_contact: "Dr. Patel (Owner)", source: "Salesforce account record" },
  calls: [
    { date: "Feb 9", title: "Port check during setup", minutes: 12, transcript:
`Maya: I ran your main number through the port check. Unfortunately it's not portable with your current carrier.
Dr. Patel: What does that mean for us?
Maya: Either you take a new phone number with Northwind, or you keep your current provider for that number and use us alongside it, which means two phone providers.
Dr. Patel: Nobody mentioned that when we signed. Patients have had that number for twenty years.
Maya: I understand. Let me check whether there's any other option with the carrier and get back to you by Friday.` }
  ],
  prepared: {
    health: "red",
    health_reason: "Their main number can't be ported, and the customer didn't know. A decision is needed before anything else moves.",
    stage: "Number port",
    facts: { pms: "Not discussed", integration: "pending", plan: "Phones", addons: [], contacts: [{name:"Dr. Patel", role:"Owner"}], it: "" },
    journey: [
      {step:"Kickoff", status:"done", note:""},
      {step:"Data sync", status:"todo", note:""},
      {step:"Texting registration", status:"todo", note:""},
      {step:"Number port", status:"blocked", note:"Main number is not portable."},
      {step:"Phone install", status:"todo", note:""},
      {step:"Training", status:"todo", note:""},
      {step:"Check-ins", status:"todo", note:""}
    ],
    where_it_stands: [
      "The main number failed the port check.",
      "Options: a new number, or keep the old provider alongside Northwind.",
      "Dr. Patel is upset: patients have used that number for 20 years."
    ],
    risks: [
      {text:"Customer may cancel over losing a 20-year number.", quote:"Patients have had that number for twenty years.", call:"Feb 9"},
      {text:"The port check wasn't done before the sale.", quote:"Nobody mentioned that when we signed.", call:"Feb 9"}
    ],
    promises: [
      {who:"us", text:"Check other options with the carrier and get back to Dr. Patel.", due:"Friday after Feb 9", quote:"Let me check whether there's any other option with the carrier and get back to you by Friday.", call:"Feb 9"}
    ],
    next_call: [
      "Bring a clear recommendation: keep the old number for calls with forwarding, or switch with a transition plan.",
      "Acknowledge the miss at signing; don't blame sales.",
      "Get a decision on this call so onboarding can continue."
    ],
    summary_60s: "Harbor Point Orthodontics is blocked at the port. Their main number, which patients have used for twenty years, is not portable with their current carrier. Dr. Patel found out after signing and is upset. The choices are a new number or keeping the old provider alongside Northwind. Maya promised to check other options with the carrier and get back by Friday. Bring a clear recommendation and get a decision, because nothing else moves until then."
  }
}
];

/* Product insights the brain finds across all accounts (prepared fallback; the AI rebuilds these live). */
window.PREPARED_INSIGHTS = [
  { title:"Integration setup is the #1 onboarding blocker", type:"friction", accounts:["lakeview","brightsmiles","peak"],
    why:"Every integration path stalls differently: an installer error that needed a tech-team ticket, a server only outside IT can reach, and software with no integration at all.",
    quotes:[{acct:"lakeview",text:"The installer is throwing an error, so I submitted a ticket to our tech team."},{acct:"brightsmiles",text:"I don't know where the server is. It's in a closet. Our IT company handles all of that."},{acct:"peak",text:"We don't have a direct integration with ClinicFlow, so patient data comes in through CSV uploads."}],
    fix:"Self-serve integration check before kickoff: detect the practice software and server access, and send the IT company a setup link automatically." },
  { title:"Sales is promising things the product can't do yet", type:"expectation", accounts:["peak","harbor"],
    why:"Customers arrive believing their software integrates or their number will port. They find out during onboarding, which is where trust breaks.",
    quotes:[{acct:"peak",text:"Wait, the rep at the conference told us it integrates. I thought it would be seamless."},{acct:"harbor",text:"Nobody mentioned that when we signed. Patients have had that number for twenty years."}],
    fix:"Add an integration and number-portability check to the sales flow, and show the result on the contract summary." },
  { title:"Number porting stalls onboarding", type:"process", accounts:["lakeview","harbor","summit"],
    why:"Ports stall on paperwork (no bill when billing is bundled), on numbers that can't be ported, or because nobody submitted them yet.",
    quotes:[{acct:"lakeview",text:"We don't get phone bills, it's bundled with another service and it's on auto pay."},{acct:"harbor",text:"Unfortunately it's not portable with your current carrier."},{acct:"summit",text:"I haven't done the port yet."}],
    fix:"Check portability at signup and accept a carrier portal screenshot when there is no paper bill." },
  { title:"Texting registration fails on business-name details", type:"friction", accounts:["lakeview"],
    why:"A duplicated name and a parenthesis made the brand not match the IRS record, so texting was rejected. The customer nearly left over it.",
    quotes:[{acct:"lakeview",text:"\"Lakeview Family Dental\" was in there twice and there was a parenthesis somewhere."},{acct:"lakeview",text:"See, this is exactly what happened before. We couldn't send any messages."}],
    fix:"Validate the brand name against the EIN record before submitting, and explain any mismatch in plain words." },
  { title:"Requested: call queue with place-in-line announcement", type:"feature", accounts:["lakeview"],
    why:"High-volume offices with one receptionist want callers to hear their position instead of ringing out.",
    quotes:[{acct:"lakeview",text:"I want callers in a queue so they hear they're fourth in line."}],
    fix:"Make the call queue with position announcements a default template for high-volume offices." },
  { title:"Requested: AI receptionist that knows why we called the patient", type:"feature", accounts:["brightsmiles"],
    why:"Offices call patients about insurance pre-approvals; when patients call back, the AI should already know the reason.",
    quotes:[{acct:"brightsmiles",text:"When they call back the AI should know why."}],
    fix:"Let the AI receptionist read outbound-call notes and greet callbacks with the reason." }
];
