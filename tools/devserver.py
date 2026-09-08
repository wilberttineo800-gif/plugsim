# Dev server for Plugsim.
#
# python3 -m http.server sends cache headers that make Safari hold on to ES
# modules across reloads, so an edit can appear to have no effect and a test can
# quietly pass against old code. That cost a debugging session once; it isn't
# worth repeating. Everything here is served no-store.

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quiet unless something actually failed.
        status = str(args[1]) if len(args) > 1 else ''
        if status.startswith(('4', '5')):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    host = sys.argv[2] if len(sys.argv) > 2 else '127.0.0.1'
    ThreadingHTTPServer((host, port), NoCacheHandler).serve_forever()
