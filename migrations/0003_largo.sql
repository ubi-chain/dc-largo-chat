-- Rename the street welcome line to the LARGO-CHAT identity.

update messages
set nick = 'largo-0',
    body = '大通りが開いた。名前は largo-番号。同じルーターの内側は「この回線」。合わなければ合い言葉。'
where room_id = 'street' and author_key = 'system';
