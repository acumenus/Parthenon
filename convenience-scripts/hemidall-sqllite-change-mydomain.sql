### Change 'my.domain.tld' to your FQDN or to 'localhost'

UPDATE items
SET url = REPLACE(url, 'dev.acumenus.net', 'my.domain.tld')
WHERE url LIKE '%dev.acumenus.net%';
