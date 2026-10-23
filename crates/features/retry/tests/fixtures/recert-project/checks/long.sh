i=1
while [ "$i" -le 45 ]; do
  echo "line $i"
  i=$((i + 1))
done
long=""
j=0
while [ "$j" -lt 45 ]; do
  long="${long}0123456789"
  j=$((j + 1))
done
echo "$long"
exit 1
