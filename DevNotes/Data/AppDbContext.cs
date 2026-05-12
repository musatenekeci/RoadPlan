using Microsoft.EntityFrameworkCore;
using DevNotes.Models;

namespace DevNotes.Data;

public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Note> Notes => Set<Note>();
}
