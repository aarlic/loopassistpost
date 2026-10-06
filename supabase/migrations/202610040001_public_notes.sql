-- Run once in a new Supabase project's SQL editor.
create table public.maps (
 id uuid primary key, owner_id uuid not null references auth.users(id), title text not null,
 "createdAt" bigint not null, "updatedAt" bigint not null, viewport jsonb,
 unique(id,owner_id)
);
create table public.nodes (
 id uuid primary key, "mapId" uuid not null references public.maps(id) on delete cascade,
 "parentId" uuid, title text not null, color text not null, content jsonb not null,
 x double precision not null, y double precision not null, "createdAt" bigint not null, "updatedAt" bigint not null,
 unique(id,"mapId"), foreign key("parentId","mapId") references public.nodes(id,"mapId") on delete cascade
);
create table public.images (
 id uuid primary key, "nodeId" uuid not null, "mapId" uuid not null,
 path text unique not null, caption text not null, "createdAt" bigint not null,
 foreign key("nodeId","mapId") references public.nodes(id,"mapId") on delete cascade
);
create index on public.nodes("mapId"); create index on public.images("nodeId");
alter table public.maps enable row level security;
alter table public.nodes enable row level security;
alter table public.images enable row level security;
create policy read_maps on public.maps for select to anon,authenticated using(true);
create policy write_maps on public.maps for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy read_nodes on public.nodes for select to anon,authenticated using(true);
create policy write_nodes on public.nodes for all to authenticated
 using(exists(select 1 from public.maps m where m.id="mapId" and m.owner_id=auth.uid()))
 with check(exists(select 1 from public.maps m where m.id="mapId" and m.owner_id=auth.uid()));
create policy read_images on public.images for select to anon,authenticated using(true);
create policy write_images on public.images for all to authenticated
 using(exists(select 1 from public.maps m where m.id="mapId" and m.owner_id=auth.uid()))
 with check(exists(select 1 from public.maps m where m.id="mapId" and m.owner_id=auth.uid()) and path=auth.uid()::text||'/'||"mapId"::text||'/'||id::text);
-- Ownership and attachment relationships are immutable after creation.
create function public.guard_relations() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='maps' then
  if new.id<>old.id or new.owner_id<>old.owner_id then raise exception 'Page ownership is immutable'; end if;
 elsif tg_table_name='nodes' then
  if new.id<>old.id or new."mapId"<>old."mapId" then raise exception 'Note page is immutable'; end if;
 else
  if new.id<>old.id or new."mapId"<>old."mapId" or new."nodeId"<>old."nodeId" or new.path<>old.path then raise exception 'Image attachment is immutable'; end if;
 end if;
 return new;
end $$;
create trigger maps_guard before update on public.maps for each row execute function public.guard_relations();
create trigger nodes_guard before update on public.nodes for each row execute function public.guard_relations();
create trigger images_guard before update on public.images for each row execute function public.guard_relations();
-- SECURITY INVOKER: RLS applies to the complete atomic page creation.
create function public.create_page(page jsonb, root jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.maps select * from jsonb_populate_record(null::public.maps,page);
 insert into public.nodes select * from jsonb_populate_record(null::public.nodes,root);
end $$;
revoke all on function public.create_page(jsonb,jsonb) from public,anon;
grant execute on function public.create_page(jsonb,jsonb) to authenticated;
grant select on public.maps,public.nodes,public.images to anon;
grant select,insert,update,delete on public.maps,public.nodes,public.images to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('note-images','note-images',false,5242880,array['image/jpeg','image/png','image/webp','image/gif']);
-- Only image objects with a published metadata record are publicly readable.
create policy read_note_images on storage.objects for select to anon,authenticated using(
 bucket_id='note-images' and exists(select 1 from public.images i where i.path=name)
);
-- Owner uploads are private until their image metadata is saved.
create policy owner_read_note_images on storage.objects for select to authenticated using(bucket_id='note-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy insert_note_images on storage.objects for insert to authenticated with check(
 bucket_id='note-images' and (storage.foldername(name))[1]=auth.uid()::text and
 exists(select 1 from public.maps m where m.id::text=(storage.foldername(name))[2] and m.owner_id=auth.uid())
);
create policy update_note_images on storage.objects for update to authenticated using(
 bucket_id='note-images' and (storage.foldername(name))[1]=auth.uid()::text
) with check(bucket_id='note-images' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.maps m where m.id::text=(storage.foldername(name))[2] and m.owner_id=auth.uid()));
create policy delete_note_images on storage.objects for delete to authenticated using(bucket_id='note-images' and (storage.foldername(name))[1]=auth.uid()::text);
