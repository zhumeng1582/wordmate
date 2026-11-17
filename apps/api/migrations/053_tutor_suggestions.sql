SET search_path TO wordmate,public;
CREATE TABLE IF NOT EXISTS tutor_reply_suggestions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 word_message_id uuid UNIQUE REFERENCES word_tutor_messages(id) ON DELETE CASCADE,
 poem_message_id uuid UNIQUE REFERENCES poem_messages(id) ON DELETE CASCADE,
 hanzi_message_id uuid UNIQUE REFERENCES hanzi_messages(id) ON DELETE CASCADE,
 assistant_message_id uuid UNIQUE REFERENCES learning_assistant_messages(id) ON DELETE CASCADE,
 suggestions jsonb NOT NULL CHECK(jsonb_typeof(suggestions)='array' AND jsonb_array_length(suggestions)<=3),
 CHECK(num_nonnulls(word_message_id,poem_message_id,hanzi_message_id,assistant_message_id)=1)
);
