-- edit_message: update a message body with a 10-minute ownership + time guard.
-- Returns null on success, error text on failure.
create or replace function public.edit_message(
  p_message uuid,
  p_body text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_created timestamptz;
begin
  select sender_id, created_at into v_sender, v_created
    from public.messages where id = p_message;

  if v_sender is null then
    return 'Message not found.';
  end if;

  if v_sender <> auth.uid() then
    return 'You can only edit your own messages.';
  end if;

  if now() - v_created > interval '10 minutes' then
    return 'Messages can only be edited within 10 minutes of sending.';
  end if;

  update public.messages
    set body = p_body,
        edited_at = now()
    where id = p_message;

  return null;
end;
$$;

-- Allow the authenticated caller to invoke the RPC.
grant execute on function public.edit_message(uuid, text) to authenticated;

-- edit_group_message: same 10-minute ownership guard for group messages.
create or replace function public.edit_group_message(
  p_message uuid,
  p_body text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_created timestamptz;
begin
  select sender_id, created_at into v_sender, v_created
    from public.group_messages where id = p_message;

  if v_sender is null then
    return 'Message not found.';
  end if;

  if v_sender <> auth.uid() then
    return 'You can only edit your own messages.';
  end if;

  if now() - v_created > interval '10 minutes' then
    return 'Messages can only be edited within 10 minutes of sending.';
  end if;

  update public.group_messages
    set body = p_body,
        edited_at = now()
    where id = p_message;

  return null;
end;
$$;

grant execute on function public.edit_group_message(uuid, text) to authenticated;

-- edit_community_message: same 10-minute ownership guard for community messages.
create or replace function public.edit_community_message(
  p_message uuid,
  p_body text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_created timestamptz;
begin
  select sender_id, created_at into v_sender, v_created
    from public.community_messages where id = p_message;

  if v_sender is null then
    return 'Message not found.';
  end if;

  if v_sender <> auth.uid() then
    return 'You can only edit your own messages.';
  end if;

  if now() - v_created > interval '10 minutes' then
    return 'Messages can only be edited within 10 minutes of sending.';
  end if;

  update public.community_messages
    set body = p_body,
        edited_at = now()
    where id = p_message;

  return null;
end;
$$;

grant execute on function public.edit_community_message(uuid, text) to authenticated;
