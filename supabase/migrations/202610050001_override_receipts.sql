-- Receipts are attached to one payment or income in one month.
-- The file lives in Storage (bucket "receipts"); the row keeps its path.
begin;
alter table public.monthly_overrides
  add column receipt_path text check (receipt_path is null or (length(receipt_path) between 1 and 500 and split_part(receipt_path,'/',1) = user_id::text));
notify pgrst, 'reload schema';
commit;
