const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data: msgs, error: e1 } = await supabase
    .from('zalo_incoming_chats')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('--- RECENT ZALO INCOMING CHATS ---', e1 || '');
  console.log(msgs?.map(m => ({ id: m.id, partner_id: m.partner_id, text: m.text_content, event: m.event_name, submission_id: m.submission_id })));

  const { data: subs, error: e2 } = await supabase
    .from('submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('--- RECENT SUBMISSIONS (BATCHES) ---', e2 || '');
  console.log(subs?.map(s => ({ id: s.id, status: s.status, ai_status: s.ai_status, msg_count: s.msg_count, raw_text: s.raw_text?.substring(0, 80), close_at: s.close_at })));

  const { data: listings, error: e3 } = await supabase
    .from('property_listings')
    .select('id, submission_id, status, title, price_raw, created_at')
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('--- RECENT PROPERTY LISTINGS ---', e3 || '');
  console.log(listings);
}

check().catch(console.error);
