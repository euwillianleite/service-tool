-- 0001b — valor 'agente' no enum papel, em migração própria: o Postgres não deixa usar um valor novo de enum na mesma transação em que ele foi criado
alter type papel add value if not exists 'agente';
