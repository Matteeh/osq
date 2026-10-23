#!/bin/sh
if [ "$3" = "$OSQ_FAKE_SLOW" ]; then exec sleep 30; fi
exit 0
