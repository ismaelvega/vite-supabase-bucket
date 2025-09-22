Ok so Im going to use Vercel functions.

Im having my first steps with Supabase Buckets, I want to see if it's a good fit for my use case.

My app will not have auth.
So the files will be public.
I want to upload files from the client side, but I want to avoid exposing my anon key.

I just created my bucket, it's public.
Name: "vitejs"
Accepts application/pdf only.

The user will be able to upload a file, and then get a link to visualize it and download it.

I want the link to expire like in a year or so.

Users wont be able to delete or update files.